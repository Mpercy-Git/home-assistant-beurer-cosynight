"""Beurer CosyNight integration."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

import voluptuous as vol

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONF_PASSWORD,
    CONF_USERNAME,
    EVENT_HOMEASSISTANT_STARTED,
    Platform,
)
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import (
    ConfigEntryAuthFailed,
    ConfigEntryNotReady,
    HomeAssistantError,
)
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .beurer_cosynight import (
    AiohttpClient,
    ApiError,
    AuthError,
    BeurerCosyNight,
    Quickstart,
)
from .const import (
    DOMAIN,
    SECONDS_PER_MINUTE,
    TIMER_DEFAULT_MINUTES,
    TIMER_MAX_MINUTES,
    TIMER_MIN_MINUTES,
)
from .coordinator import BeurerCosyNightCoordinator
from .number import TimerNumber

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [
    Platform.SELECT,
    Platform.SENSOR,
    Platform.BUTTON,
    Platform.NUMBER,
]

CARD_NAME = "beurer-cosynight-card"
CARD_URL = f"/{CARD_NAME}.js"
CARD_URL_ALIAS = f"/{DOMAIN}/{CARD_NAME}.js"
# Card bookkeeping lives outside hass.data[DOMAIN] so that entry teardown can
# keep treating that dict as "one key per config entry".
CARD_DATA_KEY = f"{DOMAIN}_card"
STATIC_REGISTERED_KEY = "static_registered"
STARTUP_LISTENER_KEY = "startup_listener"
LOVELACE_RETRY_MAX = 5
LOVELACE_RETRY_DELAY = 2

QUICKSTART_SCHEMA = vol.Schema(
    {
        vol.Required("device_id"): str,
        vol.Required("body"): vol.All(vol.Coerce(int), vol.Range(min=0, max=9)),
        vol.Required("feet"): vol.All(vol.Coerce(int), vol.Range(min=0, max=9)),
        vol.Optional("timer"): vol.All(
            vol.Coerce(int),
            vol.Range(min=TIMER_MIN_MINUTES, max=TIMER_MAX_MINUTES),
        ),
    }
)


def _card_file_info(frontend_file: Path) -> tuple[bool, int]:
    """Return whether the card file exists and its mtime (blocking)."""
    try:
        return True, int(os.path.getmtime(frontend_file))
    except OSError:
        return False, 0


async def _async_register_lovelace_resource(
    hass: HomeAssistant, resource_url: str, retry_count: int = 0
) -> None:
    """Register the card URL as a Lovelace resource (storage mode)."""
    lovelace_data = hass.data.get("lovelace")
    if lovelace_data is None:
        if retry_count < LOVELACE_RETRY_MAX:
            await asyncio.sleep(LOVELACE_RETRY_DELAY)
            return await _async_register_lovelace_resource(
                hass, resource_url, retry_count + 1
            )
        _LOGGER.warning("Could not auto-register card: Lovelace not initialized")
        return

    resources = getattr(lovelace_data, "resources", None)
    if resources is None and hasattr(lovelace_data, "get"):
        resources = lovelace_data.get("resources")

    if resources is None:
        # YAML mode dashboards require the resource in configuration.yaml.
        _LOGGER.warning(
            "Could not auto-register card resource: Lovelace resources unavailable"
        )
        return

    if not hasattr(resources, "async_create_item") or not hasattr(
        resources, "async_items"
    ):
        _LOGGER.warning(
            "Could not auto-register card resource: Lovelace resources API unavailable"
        )
        return

    # Ensure the storage collection is loaded before inspecting existing items.
    if hasattr(resources, "async_get_info"):
        await resources.async_get_info()

    existing_resource = None
    for item in resources.async_items():
        url = item.get("url", "")
        if isinstance(url, str) and url.startswith(CARD_URL):
            existing_resource = item
            break

    if existing_resource:
        if existing_resource.get("url") != resource_url:
            await resources.async_update_item(
                existing_resource["id"],
                {"url": resource_url, "res_type": "module"},
            )
            _LOGGER.info("Updated Beurer card Lovelace resource: %s", resource_url)
        return

    await resources.async_create_item({"url": resource_url, "res_type": "module"})
    _LOGGER.info("Added Beurer card Lovelace resource: %s", resource_url)


async def _async_register_card(hass: HomeAssistant) -> None:
    """Serve the bundled card and register it as a Lovelace resource."""
    card_data = hass.data.setdefault(CARD_DATA_KEY, {})
    frontend_file = Path(__file__).parent / "frontend" / f"{CARD_NAME}.js"

    exists, cache_bust = await hass.async_add_executor_job(
        _card_file_info, frontend_file
    )
    if not exists:
        _LOGGER.error("Card frontend file missing: %s", frontend_file)
        return

    if not card_data.get(STATIC_REGISTERED_KEY):
        try:
            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        CARD_URL, str(frontend_file), cache_headers=False
                    ),
                    StaticPathConfig(
                        CARD_URL_ALIAS, str(frontend_file), cache_headers=False
                    ),
                ]
            )
        except RuntimeError:
            # Already registered on reload.
            pass
        card_data[STATIC_REGISTERED_KEY] = True

    await _async_register_lovelace_resource(hass, f"{CARD_URL}?v={cache_bust}")


async def _async_setup_card(hass: HomeAssistant) -> None:
    """Register the card now, or once Home Assistant has started."""
    try:
        if hass.is_running:
            await _async_register_card(hass)
            return

        card_data = hass.data.setdefault(CARD_DATA_KEY, {})
        if card_data.get(STARTUP_LISTENER_KEY) is None:

            async def _register_when_started(_event=None) -> None:
                await _async_register_card(hass)

            card_data[STARTUP_LISTENER_KEY] = hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED, _register_when_started
            )
    except Exception:  # noqa: BLE001 - the card must never block integration setup
        _LOGGER.exception("Could not register the Beurer CosyNight card")


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the integration (card registration only)."""
    await _async_setup_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Beurer CosyNight from a config entry."""
    username = entry.data[CONF_USERNAME]
    password = entry.data[CONF_PASSWORD]
    token_path = hass.config.path(f".storage/beurer_cosynight_{entry.entry_id}")

    session = async_get_clientsession(hass)
    client = AiohttpClient(session)
    hub = BeurerCosyNight(
        client, token_path=token_path, username=username, password=password
    )

    try:
        await hub.authenticate(username, password)
        devices = await hub.list_devices()
    except AuthError as err:
        raise ConfigEntryAuthFailed("Invalid credentials") from err
    except ApiError as err:
        raise ConfigEntryNotReady(f"Error communicating with API: {err}") from err

    if not devices:
        _LOGGER.warning("No Beurer CosyNight devices found")

    coordinators: dict[str, BeurerCosyNightCoordinator] = {}
    for device in devices:
        coordinator = BeurerCosyNightCoordinator(hass, hub, device.id, device.name)
        await coordinator.async_config_entry_first_refresh()
        coordinators[device.id] = coordinator

    timers: dict[str, TimerNumber] = {}
    for device in devices:
        timers[device.id] = TimerNumber(device)

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "hub": hub,
        "devices": devices,
        "coordinators": coordinators,
        "timers": timers,
    }

    await _async_setup_card(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def handle_quickstart(call: ServiceCall) -> None:
        """Handle the quickstart service call."""
        dev_reg = dr.async_get(hass)
        device_id = call.data["device_id"]
        device_entry = dev_reg.async_get(device_id)
        if device_entry is None:
            raise HomeAssistantError(f"Device {device_id} not found")

        # Find the Beurer device ID from the device registry.
        beurer_device_id: str | None = None
        for identifier in device_entry.identifiers:
            if identifier[0] == DOMAIN:
                beurer_device_id = identifier[1]
                break
        if beurer_device_id is None:
            raise HomeAssistantError(
                f"Device {device_id} is not a Beurer CosyNight device"
            )

        # Search all config entries for the coordinator and timer.
        coordinator = None
        timer_entity: TimerNumber | None = None
        for entry_data in hass.data[DOMAIN].values():
            coordinator = entry_data["coordinators"].get(beurer_device_id)
            if coordinator is not None:
                timer_entity = entry_data["timers"].get(beurer_device_id)
                break
        if coordinator is None:
            raise HomeAssistantError(f"No coordinator for device {beurer_device_id}")

        if "timer" in call.data:
            timespan = call.data["timer"] * SECONDS_PER_MINUTE
        elif timer_entity is not None:
            timespan = timer_entity.timespan_seconds
        else:
            timespan = TIMER_DEFAULT_MINUTES * SECONDS_PER_MINUTE

        qs = Quickstart(
            bodySetting=call.data["body"],
            feetSetting=call.data["feet"],
            id=beurer_device_id,
            timespan=timespan,
        )
        await coordinator.execute_quickstart(qs)

    if not hass.services.has_service(DOMAIN, "quickstart"):
        hass.services.async_register(
            DOMAIN,
            "quickstart",
            handle_quickstart,
            schema=QUICKSTART_SCHEMA,
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, "quickstart")

            card_data = hass.data.get(CARD_DATA_KEY, {})
            unsub = card_data.pop(STARTUP_LISTENER_KEY, None)
            if callable(unsub):
                unsub()
        return True
    return False
