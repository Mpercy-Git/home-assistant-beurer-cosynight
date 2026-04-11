"""Beurer CosyNight integration."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_NAME = "beurer-cosynight-card"
CARD_REGISTERED_KEY = "_card_registered"


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Beurer CosyNight from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    domain_data = hass.data[DOMAIN]
    domain_data[config_entry.entry_id] = config_entry.data

    if not domain_data.get(CARD_REGISTERED_KEY):
        frontend_file = Path(__file__).parent / "frontend" / f"{CARD_NAME}.js"
        
        # Register static path for the card
        hass.http.register_static_path(
            f"/beurer_cosynight/{CARD_NAME}.js",
            str(frontend_file),
            cache_headers=False,
        )

        # Auto-load the card resource in the frontend
        try:
            from homeassistant.components.frontend import async_register_extra_js_url
            await async_register_extra_js_url(
                hass, f"/beurer_cosynight/{CARD_NAME}.js"
            )
            _LOGGER.info("Registered Beurer CosyNight card at /beurer_cosynight/%s.js", CARD_NAME)
        except Exception as e:
            _LOGGER.warning("Could not auto-register frontend card: %s", e)

        domain_data[CARD_REGISTERED_KEY] = True
    
    await hass.config_entries.async_forward_entry_setups(config_entry, ["select"])
    return True


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(config_entry.entry_id, None)
    return True

