"""Beurer CosyNight integration."""

import logging

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass, config):
    """Set up the Beurer CosyNight integration."""
    _LOGGER.info("Setting up Beurer CosyNight integration")
    # Perform any necessary setup here
    return True

async def async_setup_entry(hass, config_entry):
    """Set up Beurer CosyNight from a config entry."""
    _LOGGER.info("Setting up Beurer CosyNight from config entry")
    # Perform setup using the config entry
    return True

