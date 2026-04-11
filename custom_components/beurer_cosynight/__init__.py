"""Beurer CosyNight integration."""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_NAME = "beurer-cosynight-card"
CARD_URL = "/beurer-cosynight-card.js"
CARD_URL_ALIAS = f"/beurer_cosynight/{CARD_NAME}.js"
STATIC_REGISTERED_KEY = "_card_static_registered"
STARTUP_LISTENER_KEY = "_startup_listener"
LOVELACE_RETRY_MAX = 5
LOVELACE_RETRY_DELAY = 2


def _versioned_card_url(frontend_file: Path) -> str:
    """Build cache-busted card URL."""
    try:
        cache_bust = int(os.path.getmtime(frontend_file))
    except OSError:
        cache_bust = 0
    return f"{CARD_URL}?v={cache_bust}"


async def _async_register_lovelace_resource(hass: HomeAssistant, resource_url: str, retry_count: int = 0) -> None:
    """Register card URL as Lovelace resource (storage mode)."""
    lovelace_data = hass.data.get("lovelace")
    if lovelace_data is None:
        if retry_count < LOVELACE_RETRY_MAX:
            await asyncio.sleep(LOVELACE_RETRY_DELAY)
            return await _async_register_lovelace_resource(hass, resource_url, retry_count + 1)
        _LOGGER.warning("Could not auto-register card: Lovelace not initialized")
        return

    resources = getattr(lovelace_data, "resources", None)
    if resources is None and hasattr(lovelace_data, "get"):
        resources = lovelace_data.get("resources")

    if resources is None:
        # YAML mode dashboards require manual resources in configuration.
        _LOGGER.warning("Could not auto-register card resource: Lovelace resources unavailable")
        return

    if not hasattr(resources, "async_create_item") or not hasattr(resources, "async_items"):
        _LOGGER.warning("Could not auto-register card resource: Lovelace resources API unavailable")
        return

    # Ensure storage collection is loaded before checking existing items.
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
    """Register static card resources and frontend URL once."""
    domain_data = hass.data.setdefault(DOMAIN, {})

    frontend_file = Path(__file__).parent / "frontend" / f"{CARD_NAME}.js"

    if not frontend_file.exists():
        _LOGGER.error("Card frontend file missing: %s", frontend_file)
        return

    if not domain_data.get(STATIC_REGISTERED_KEY):
        try:
            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(CARD_URL, str(frontend_file), cache_headers=False),
                    StaticPathConfig(CARD_URL_ALIAS, str(frontend_file), cache_headers=False),
                ]
            )
        except RuntimeError:
            # Already registered on reload.
            pass
        domain_data[STATIC_REGISTERED_KEY] = True

    resource_url = _versioned_card_url(frontend_file)
    await _async_register_lovelace_resource(hass, resource_url)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up Beurer CosyNight integration."""
    hass.data.setdefault(DOMAIN, {})

    async def _register_when_started(_event=None) -> None:
        await _async_register_card(hass)

    if hass.is_running:
        await _async_register_card(hass)
    else:
        domain_data = hass.data[DOMAIN]
        if domain_data.get(STARTUP_LISTENER_KEY) is None:
            domain_data[STARTUP_LISTENER_KEY] = hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED,
                _register_when_started,
            )

    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Beurer CosyNight from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    domain_data = hass.data[DOMAIN]
    domain_data[config_entry.entry_id] = config_entry.data

    await _async_register_card(hass)
    
    await hass.config_entries.async_forward_entry_setups(config_entry, ["select"])
    return True


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(config_entry, ["select"])
    if not unload_ok:
        return False

    domain_data = hass.data.get(DOMAIN, {})
    domain_data.pop(config_entry.entry_id, None)

    # If no configured entries remain, force re-registration next setup.
    transient_keys = {STATIC_REGISTERED_KEY, STARTUP_LISTENER_KEY}
    has_entries = any(k not in transient_keys for k in domain_data)
    if not has_entries:
        domain_data.pop(STATIC_REGISTERED_KEY, None)

    if STARTUP_LISTENER_KEY in domain_data:
        unsub = domain_data.pop(STARTUP_LISTENER_KEY)
        if callable(unsub):
            unsub()

    if not domain_data:
        hass.data.pop(DOMAIN, None)

    return True

