"""Tests for the bundled Lovelace card registration."""

from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

import custom_components.beurer_cosynight as integration
from custom_components.beurer_cosynight import (
    CARD_DATA_KEY,
    CARD_NAME,
    CARD_URL,
    CARD_URL_ALIAS,
    STARTUP_LISTENER_KEY,
    STATIC_REGISTERED_KEY,
    async_setup,
)


class FakeResources:
    """Test double for the Lovelace resource storage collection."""

    def __init__(self, items: list[dict] | None = None) -> None:
        self.items = list(items or [])
        self.created: list[dict] = []
        self.updated: list[tuple[str, dict]] = []

    async def async_get_info(self) -> dict:
        return {}

    def async_items(self) -> list[dict]:
        return list(self.items)

    async def async_create_item(self, item: dict) -> None:
        self.created.append(item)

    async def async_update_item(self, item_id: str, changes: dict) -> None:
        self.updated.append((item_id, changes))


@pytest.fixture
def resources() -> FakeResources:
    """Return an empty Lovelace resource collection."""
    return FakeResources()


@pytest.fixture
def card_hass(mock_hass, resources):
    """Return a mock hass wired up for card registration."""
    hass = mock_hass
    hass.is_running = True
    hass.data["lovelace"] = SimpleNamespace(resources=resources)
    hass.http.async_register_static_paths = AsyncMock()

    async def _run(func, *args):
        return func(*args)

    hass.async_add_executor_job = AsyncMock(side_effect=_run)
    return hass


def card_file() -> Path:
    """Return the path of the bundled card."""
    return Path(integration.__file__).parent / "frontend" / f"{CARD_NAME}.js"


def expected_url() -> str:
    """Return the cache-busted URL for the bundled card."""
    return f"{CARD_URL}?v={int(os.path.getmtime(card_file()))}"


async def test_setup_serves_card_and_registers_resource(card_hass, resources):
    """The card is served on both paths and registered with Lovelace."""
    assert await async_setup(card_hass, {}) is True

    paths = card_hass.http.async_register_static_paths.call_args[0][0]
    assert [p.url_path for p in paths] == [CARD_URL, CARD_URL_ALIAS]
    assert all(p.path == str(card_file()) for p in paths)
    assert all(p.cache_headers is False for p in paths)

    assert resources.created == [{"url": expected_url(), "res_type": "module"}]
    assert card_hass.data[CARD_DATA_KEY][STATIC_REGISTERED_KEY] is True


async def test_stale_resource_is_updated_not_duplicated(card_hass, resources):
    """A resource left over from an older card version is updated in place."""
    resources.items.append({"id": "res-1", "url": f"{CARD_URL}?v=1"})

    await async_setup(card_hass, {})

    assert resources.created == []
    assert resources.updated == [
        ("res-1", {"url": expected_url(), "res_type": "module"})
    ]


async def test_current_resource_is_left_alone(card_hass, resources):
    """An up-to-date resource is neither recreated nor rewritten."""
    resources.items.append({"id": "res-1", "url": expected_url()})

    await async_setup(card_hass, {})

    assert resources.created == []
    assert resources.updated == []


async def test_missing_card_file_is_not_registered(card_hass, resources):
    """A missing card file is reported without registering anything."""
    with patch.object(integration, "_card_file_info", return_value=(False, 0)):
        assert await async_setup(card_hass, {}) is True

    card_hass.http.async_register_static_paths.assert_not_called()
    assert resources.created == []


async def test_registration_failure_does_not_break_setup(card_hass, resources):
    """Setup still succeeds when the card cannot be registered."""
    card_hass.http.async_register_static_paths = AsyncMock(
        side_effect=ValueError("boom")
    )

    assert await async_setup(card_hass, {}) is True
    assert resources.created == []


async def test_registration_deferred_until_home_assistant_starts(
    card_hass, resources
):
    """During startup, registration waits for the started event."""
    card_hass.is_running = False

    await async_setup(card_hass, {})

    card_hass.bus.async_listen_once.assert_called_once()
    assert card_hass.data[CARD_DATA_KEY][STARTUP_LISTENER_KEY] is not None
    assert resources.created == []
    card_hass.http.async_register_static_paths.assert_not_called()


async def test_yaml_mode_dashboard_is_tolerated(card_hass):
    """A Lovelace setup without a resource collection does not raise."""
    card_hass.data["lovelace"] = SimpleNamespace(resources=None)

    assert await async_setup(card_hass, {}) is True
    card_hass.http.async_register_static_paths.assert_called_once()


async def test_lovelace_not_ready_is_retried_then_abandoned(card_hass):
    """Registration retries while Lovelace is missing, then gives up quietly."""
    card_hass.data.pop("lovelace")

    with patch.object(integration, "LOVELACE_RETRY_DELAY", 0):
        assert await async_setup(card_hass, {}) is True
