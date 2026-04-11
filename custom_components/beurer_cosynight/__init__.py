"""Beurer CosyNight integration."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_NAME = "beurer-cosynight-card"
CARD_REGISTERED_KEY = "_card_registered"


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


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Beurer CosyNight from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    domain_data = hass.data[DOMAIN]
    domain_data[config_entry.entry_id] = config_entry.data

    if not domain_data.get(CARD_REGISTERED_KEY):
        frontend_file = Path(__file__).parent / "frontend" / f"{CARD_NAME}.js"
        card_url = f"/beurer_cosynight/{CARD_NAME}.js"
        local_card_url = f"/local/beurer_cosynight/{CARD_NAME}.js"

        if not frontend_file.exists():
            _LOGGER.error("Card frontend file missing: %s", frontend_file)
            return False
        
        # Register static paths for the card.
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
                )
            ]
        )

        # Auto-load the card resource in the frontend.
        await _register_frontend_resource(hass, local_card_url)
        _LOGGER.info(
            "Registered Beurer CosyNight card resources: %s and %s",
            card_url,
            local_card_url,
        )

        domain_data[CARD_REGISTERED_KEY] = True
    
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

