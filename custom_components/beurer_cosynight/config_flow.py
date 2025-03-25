"""Config flow for Beurer CosyNight integration."""
from __future__ import annotations

import logging
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import config_validation as cv

from . import beurer_cosynight
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class BeurerCosyNightConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Beurer CosyNight."""

    VERSION = 1

    async def async_step_user(self, user_input=None) -> FlowResult:
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            username = user_input["username"]
            password = user_input["password"]

            # Validate credentials
            hub = beurer_cosynight.BeurerCosyNight()
            try:
                await self.hass.async_add_executor_job(hub.authenticate, username, password)
                return self.async_create_entry(title="Beurer CosyNight", data=user_input)
            except Exception as e:
                _LOGGER.error("Authentication failed: %s", e)
                errors["base"] = "auth"

        data_schema = vol.Schema(
            {
                vol.Required("username"): cv.string,
                vol.Required("password"): cv.string,
            }
        )

        return self.async_show_form(step_id="user", data_schema=data_schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return BeurerCosyNightOptionsFlowHandler(config_entry)


class BeurerCosyNightOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for Beurer CosyNight."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options_schema = vol.Schema(
            {
                vol.Optional("option_key", default=self.config_entry.options.get("option_key", "")): cv.string,
            }
        )

        return self.async_show_form(step_id="init", data_schema=options_schema)