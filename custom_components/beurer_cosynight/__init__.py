"""Beurer CosyNight integration."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_NAME = "beurer-cosynight-card"
CARD_REGISTERED_KEY = "_card_registered"
CARD_VERSION = "1.1.8"


async def _register_frontend_resource(hass: HomeAssistant, card_url: str) -> None:
    """Register the frontend resource using whichever API is available."""
    try:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, card_url)
        return
    except Exception as err:
        _LOGGER.debug("add_extra_js_url unavailable/failed: %s", err)

    try:
        from homeassistant.components.frontend import async_register_extra_js_url

        await async_register_extra_js_url(hass, card_url)
        return
    except Exception as err:
        _LOGGER.warning("Could not auto-register frontend card resource: %s", err)


async def _async_register_card(hass: HomeAssistant) -> None:
    """Register static card resources and frontend URL once."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get(CARD_REGISTERED_KEY):
        return

    frontend_file = Path(__file__).parent / "frontend" / f"{CARD_NAME}.js"
    card_url = f"/beurer_cosynight/{CARD_NAME}.js"
    local_card_url = f"/local/beurer_cosynight/{CARD_NAME}.js"

    if not frontend_file.exists():
        _LOGGER.error("Card frontend file missing: %s", frontend_file)
        return

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                card_url,
                str(frontend_file),
                cache_headers=False,
            ),
            StaticPathConfig(
                local_card_url,
                str(frontend_file),
                cache_headers=False,
            ),
        ]
    )

    try:
        cache_bust = int(os.path.getmtime(frontend_file))
    except OSError:
        cache_bust = 0

    # Alarmo-style cache busting prevents stale resource caches from hiding the card.
    resource_url = f"{local_card_url}?v={CARD_VERSION}&m={cache_bust}"
    await _register_frontend_resource(hass, resource_url)
    _LOGGER.info(
        "Registered Beurer CosyNight card resources: %s and %s (resource=%s)",
        card_url,
        local_card_url,
        resource_url,
    )
    domain_data[CARD_REGISTERED_KEY] = True


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up Beurer CosyNight integration."""
    hass.data.setdefault(DOMAIN, {})
    await _async_register_card(hass)
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
    has_entries = any(k != CARD_REGISTERED_KEY for k in domain_data)
    if not has_entries:
        domain_data.pop(CARD_REGISTERED_KEY, None)

    if not domain_data:
        hass.data.pop(DOMAIN, None)

    return True

