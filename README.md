Forked from https://github.com/damonkohler/home-assistant-beurer-cosynight

# Unofficial Beurer CosyNight Home Assistant Integration

Home Assistant custom integration for controlling [Beurer CosyNight](https://www.beurer.com/) heated mattress covers via the Beurer cloud API, bundled with a dashboard card shaped like the bed.

## Features

- Add Beurer CosyNight devices via the Home Assistant UI
- Control body and feet zone levels (0–9) per side
- Session timer, remaining-time sensor and a stop button per device
- A bundled Lovelace card — no extra cards or resources to install
- `quickstart` service for setting both zones in a single API call

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant
2. Go to **Integrations** → **Custom repositories**
3. Add this repository URL: `https://github.com/Mpercy-Git/home-assistant-beurer-cosynight`
4. Select **Integration** as the category
5. Install **Beurer CosyNight** and restart Home Assistant

### Manual

1. Copy the `custom_components/beurer_cosynight` folder into your `config/custom_components/` directory
2. Restart Home Assistant

## Configuration

Setup is done entirely through the Home Assistant UI. No YAML configuration is required.

1. Go to **Settings** → **Devices & services** → **Add integration**
2. Search for **Beurer CosyNight**
3. Enter your Beurer account email and password

### Re-authentication

If your Beurer account credentials change or expire, the integration detects the authentication failure and prompts you to re-authenticate:

1. A "Re-authenticate" notification appears in **Settings** → **Devices & services**
2. Click **Re-authenticate** and enter your updated email and password
3. The integration validates the new credentials and resumes normal operation

If the new credentials belong to a different account than the original setup, re-authentication is aborted to prevent accidental account switching.

## Entities

Each connected mattress pad creates the following entities, named after the device (a device is typically one side of the bed, e.g. "Left Side"):

| Entity | Type | Example entity ID | Description |
|--------|------|-------------------|-------------|
| **Body Zone** | Select (0–9) | `select.left_side_body_zone` | Heating level for the body zone. `0` is off. |
| **Feet Zone** | Select (0–9) | `select.left_side_feet_zone` | Heating level for the feet zone. `0` is off. |
| **Timer** | Number (1–240 min) | `number.left_side_timer` | Session duration in minutes. Defaults to 60. |
| **Remaining Time** | Sensor (seconds) | `sensor.left_side_remaining_time` | Time remaining in the current heating session. |
| **Stop** | Button | `button.left_side_stop` | Immediately stops the active heating session. |

Changing a zone level or timer starts (or updates) a heating session on the device. The **Stop** button sets both zones to 0 and ends the session.

## Dashboard Card (Lovelace)

A visual card is bundled with the integration as `custom:beurer-cosynight-card`. No extra Lovelace cards or manual resources are required.

It provides:

- Bed-shaped layout: headboard, a pillow per side, quilted mattress zones, and each side's timer built into the turned-down duvet at the foot
- Zones placed on the bed by side and area — left/right columns, body zones above feet zones
- Current level for each zone (0–9), with a heat meter and a warm glow that tracks the level
- Multiple ways to change levels:
	- +/- buttons for quick level stepping
	- Per-zone dropdown for direct level selection
	- Timer duration, remaining time and stop, per side
- **GUI configuration** — configure zones and timer entities in the visual dashboard editor

### Setup

1. **Restart Home Assistant** after installing/updating the integration (to load and auto-register the bundled card).

2. Create a new card on your dashboard:
   - Click **+ Create card**
   - Type: `custom:beurer-cosynight-card`
   - Click the card to open the **visual editor** and configure:
     - Card title
     - Layout (bed or plain tiles)
     - Zone names & entity IDs
     - Timer, remaining-time and stop entities (optional)

3. Alternatively, use YAML config (paste into a Manual card):

```yaml
type: custom:beurer-cosynight-card
title: Beurer CosyNight
layout: bed # "bed" (default) or "plain" for unstyled tiles
zones:
  - name: Left Body
    entity: select.left_side_body_zone
    colour_style: body
  - name: Right Body
    entity: select.right_side_body_zone
    colour_style: body
  - name: Left Feet
    entity: select.left_side_feet_zone
    colour_style: feet
  - name: Right Feet
    entity: select.right_side_feet_zone
    colour_style: feet
timers:
  - name: Left Side
    timer_entity: number.left_side_timer
    timer_sensor_entity: sensor.left_side_remaining_time
    stop_button_entity: button.left_side_stop
  - name: Right Side
    timer_entity: number.right_side_timer
    timer_sensor_entity: sensor.right_side_remaining_time
    stop_button_entity: button.right_side_stop
```

### Layout notes

- Each zone is placed on the bed from its config: the **side** comes from `left`/`right` in the zone name (or an explicit `side: left` / `side: right`), and the **row** comes from `colour_style` — `body` zones sit below the pillows, `feet` zones at the foot of the bed.
- Zones with no side in their name are spread across the columns in config order.
- Timers sit in the duvet fold at the foot of the bed, in the column of the side they control.
- `timer_entity` accepts the `number` timer entity; the card offers duration presets within the entity's own min/max. A `select` entity is still accepted (as `timer_entity` or the older `timer_select_entity`) for custom setups.
- Set `layout: plain` if you would rather have simple tiles without the bed frame, pillows and duvet.

Find your entities under **Settings → Devices & Services → Beurer CosyNight**.

## Services

### `beurer_cosynight.quickstart`

Start heating with explicit body and feet zone levels in a single API call. This is the preferred method for automations that need to set both zones simultaneously, as it avoids race conditions from concurrent zone updates.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `device_id` | Yes | The HA device ID of the Beurer CosyNight device. |
| `body` | Yes | Heating level for the body zone (0–9). |
| `feet` | Yes | Heating level for the feet zone (0–9). |
| `timer` | No | Session duration in minutes (1–240). Defaults to 60. |

**Example automation:**

```yaml
- action: beurer_cosynight.quickstart
  data:
    device_id: your_device_id_here
    body: 3
    feet: 3
    timer: 90
```

**Why use quickstart instead of zone selects?** Calling `select.select_option` on the body and feet zones sequentially sends a separate API request for each, and the second can race with the first, overwriting the body setting. The quickstart service sets both zones in a single request. Both paths take the same per-device lock to prevent interleaving with other operations.

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

## Credits

Based on https://github.com/damonkohler/home-assistant-beurer-cosynight

## License

[Apache 2.0](LICENSE)
