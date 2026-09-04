Forked from https://github.com/damonkohler/home-assistant-beurer-cosynight

# Unofficial Beurer CosyNight Home Assistant Integration

Minimal Home Assistant integration for Beurer CosyNight heated matress cover.

## Features

- Add Beurer CosyNight devices via Home Assistant UI
- Control body and feet zone settings (0-9 intensity levels)

## Installation

1. Add this repository to HACS
2. Install the integration
3. Go to **Settings → Devices & Services → Create Integration**
4. Search for "Beurer CosyNight"
5. Enter your Beurer CosyNight account credentials
6. Select zones to add as Home Assistant entities

## Configuration

Setup is done entirely through the Home Assistant GUI. No YAML configuration is required.

## Dashboard Card (Lovelace)

A visual card is bundled with the integration as `custom:beurer-cosynight-card`.

It provides:

- Bed-shaped layout: headboard, a pillow per side, quilted mattress zones and a turned-down duvet at the foot
- Zones are placed on the bed by side and area — left/right columns, body zones above feet zones
- Current level display for each zone (0-9), with a heat meter and a warm glow that tracks the level
- Multiple ways to change levels:
	- +/- buttons for quick level stepping
	- Per-zone dropdown selector for direct level selection
	- Optional timer selector, timer readout, and stop button
- **GUI configuration** — configure zones and timer entities via the visual dashboard editor

### Requirements

- No extra Lovelace cards required

### Setup

1. **Restart Home Assistant** after installing/updating the integration (to load and auto-register the bundled card).

2. Create a new card on your dashboard:
   - Click **+ Create card**
   - Type: `custom:beurer-cosynight-card`
   - Click on the card to open the **visual editor** and configure:
     - Card title
     - Layout (bed or plain tiles)
     - Zone names & entity IDs
     - Timer selector and stop button (optional)

3. Alternatively, use YAML config (paste in a Manual card):

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
timer_select_entity: select.left_side_timer
timer_sensor_entity: sensor.left_side_timer
stop_button_entity: button.left_side_stop
timers:
  - name: Left Side
    timer_select_entity: select.left_side_timer
    timer_sensor_entity: sensor.left_side_timer
    stop_button_entity: button.left_side_stop
  - name: Right Side
    timer_select_entity: select.right_side_timer
    timer_sensor_entity: sensor.right_side_timer
    stop_button_entity: button.right_side_stop
```

### Layout notes

- Each zone is placed on the bed from its config: the **side** comes from `left`/`right` in the zone name (or an explicit `side: left` / `side: right`), and the **row** comes from `colour_style` — `body` zones sit below the pillows, `feet` zones at the foot of the bed.
- Zones with no side in their name are spread across the columns in config order, so existing configurations keep working.
- Timers are grouped the same way and shown below the bed, under the side they belong to.
- Set `layout: plain` if you would rather have simple tiles without the bed frame, pillows and duvet.

Find your entities under **Settings → Devices & Services → Beurer CosyNight**.

## Credits

Based on https://github.com/damonkohler/home-assistant-beurer-cosynight
