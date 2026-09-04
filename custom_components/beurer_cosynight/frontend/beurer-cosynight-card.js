const BEURER_ROW_ORDER = ["body", "feet"];

class BeurerCosyNightCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};

    const zones = this._getZones();
    if (!zones.length) {
      throw new Error("At least one zone entity is required");
    }
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
    }

    this._render();
  }

  getCardSize() {
    return 8;
  }

  _esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _getZones() {
    if (Array.isArray(this._config.zones) && this._config.zones.length) {
      return this._config.zones.map((zone) => ({
        ...zone,
        colour_style: this._normaliseColourStyle(zone),
      }));
    }

    const fallback = [
      { name: "Left Body", entity: this._config.left_body_entity, colour_style: "body" },
      { name: "Right Body", entity: this._config.right_body_entity, colour_style: "body" },
      { name: "Left Feet", entity: this._config.left_feet_entity, colour_style: "feet" },
      { name: "Right Feet", entity: this._config.right_feet_entity, colour_style: "feet" },
    ];

    return fallback.filter((z) => z.entity);
  }

  _normaliseColourStyle(zone) {
    const raw = String(zone.colour_style || zone.tone || "body");
    if (raw === "feet_left" || raw === "feet_right") {
      return "feet";
    }
    return raw === "feet" ? "feet" : "body";
  }

  _colourStyleBase(colourStyle) {
    if (colourStyle === "feet") {
      return [255, 189, 64];
    }
    return [255, 193, 102];
  }

  _zoneHeatAlpha(state) {
    const value = Number.parseInt(state, 10);
    if (Number.isNaN(value)) {
      return 0.12;
    }
    return Math.max(0.12, Math.min(0.85, 0.12 + value * 0.08));
  }

  _layoutMode() {
    return String(this._config.layout || "bed").toLowerCase() === "plain" ? "plain" : "bed";
  }

  _detectSide(...values) {
    const text = values
      .filter((value) => value !== undefined && value !== null && value !== "")
      .join(" ")
      .toLowerCase();

    if (text.includes("left")) {
      return "left";
    }
    if (text.includes("right")) {
      return "right";
    }
    return null;
  }

  _sideLabel(side) {
    if (side === "left") {
      return "Left";
    }
    if (side === "right") {
      return "Right";
    }
    return "";
  }

  _levelInfo(stateObj) {
    const options = ((stateObj && stateObj.attributes && stateObj.attributes.options) || []).map((o) => String(o));
    const state = stateObj ? String(stateObj.state) : "unknown";
    const parsed = Number.parseInt(state, 10);
    const numericOptions = options
      .map((option) => Number.parseInt(option, 10))
      .filter((option) => !Number.isNaN(option));
    const max = numericOptions.length ? Math.max(...numericOptions) : 9;

    return {
      options,
      state,
      value: Number.isNaN(parsed) ? null : parsed,
      max: max > 0 ? max : 9,
    };
  }

  /**
   * Works out where each zone and timer sits on the bed: one column per side
   * (left/right) and one row per zone group (body above feet).
   */
  _buildLayout(zones, timers) {
    const entries = zones.map((zone) => ({
      zone,
      rowKey: this._normaliseColourStyle(zone),
      side: this._detectSide(zone.side, zone.name, zone.entity),
    }));

    const detected = ["left", "right"].filter((side) => entries.some((entry) => entry.side === side));
    const sides = detected.length ? detected : entries.length > 1 ? ["side-1", "side-2"] : ["side-1"];

    let cursor = 0;
    entries.forEach((entry) => {
      if (!entry.side || sides.indexOf(entry.side) === -1) {
        entry.side = sides[cursor % sides.length];
        cursor += 1;
      }
    });

    const rowKeys = BEURER_ROW_ORDER.filter((key) => entries.some((entry) => entry.rowKey === key));
    entries.forEach((entry) => {
      if (rowKeys.indexOf(entry.rowKey) === -1) {
        rowKeys.push(entry.rowKey);
      }
    });

    const rows = [];
    rowKeys.forEach((rowKey) => {
      const inRow = entries.filter((entry) => entry.rowKey === rowKey);
      const bySide = sides.map((side) => inRow.filter((entry) => entry.side === side));
      const depth = bySide.reduce((max, list) => Math.max(max, list.length), 0);
      for (let index = 0; index < depth; index += 1) {
        rows.push(bySide.map((list) => (list[index] ? list[index].zone : null)));
      }
    });

    const timerEntries = timers.map((timer) => ({
      timer,
      side: this._detectSide(timer.side, timer.name),
    }));

    let timerCursor = 0;
    timerEntries.forEach((entry) => {
      if (!entry.side || sides.indexOf(entry.side) === -1) {
        entry.side = sides[timerCursor % sides.length];
        timerCursor += 1;
      }
    });

    const timersBySide = sides.map((side) =>
      timerEntries.filter((entry) => entry.side === side).map((entry) => entry.timer)
    );
    const timerDepth = timersBySide.reduce((max, list) => Math.max(max, list.length), 0);
    const timerRows = [];
    for (let index = 0; index < timerDepth; index += 1) {
      timerRows.push(timersBySide.map((list) => list[index] || null));
    }

    return { sides, rows, timerRows };
  }

  _getTimerControls() {
    if (Array.isArray(this._config.timers) && this._config.timers.length) {
      return this._config.timers;
    }

    const legacy = {
      name: this._config.timer_name || "Timer",
      timer_select_entity: this._config.timer_select_entity,
      timer_sensor_entity: this._config.timer_sensor_entity,
      stop_button_entity: this._config.stop_button_entity,
    };

    if (legacy.timer_select_entity || legacy.timer_sensor_entity || legacy.stop_button_entity) {
      return [legacy];
    }

    return [];
  }

  _render() {
    if (!this._hass || !this._config) {
      return;
    }

    const zones = this._getZones();
    const title = this._config.title || "Beurer CosyNight";
    const layoutMode = this._layoutMode();
    const layout = this._buildLayout(zones, this._getTimerControls());

    const renderZone = (zone) => {
      if (!zone) {
        return `<div class="zone zone--empty" aria-hidden="true"></div>`;
      }

      const stateObj = this._hass.states[zone.entity];
      const info = this._levelInfo(stateObj);
      const alpha = this._zoneHeatAlpha(info.state);
      const base = this._colourStyleBase(this._normaliseColourStyle(zone));
      const heatTop = `rgba(${base[0]}, ${Math.min(255, base[1] + 36)}, ${Math.min(255, base[2] + 48)}, ${(alpha * 0.8).toFixed(3)})`;
      const heatBottom = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha.toFixed(3)})`;
      const heatGlow = `rgba(255, 138, 46, ${(Math.max(0, alpha - 0.12) * 0.85).toFixed(3)})`;
      const isOn = (info.value || 0) > 0;

      const optionsMarkup = info.options
        .map((opt) => {
          const selected = opt === info.state ? " selected" : "";
          return `<option value="${this._esc(opt)}"${selected}>${this._esc(opt)}</option>`;
        })
        .join("");

      const segmentCount = Math.min(info.max, 12);
      const filled = info.value === null ? 0 : info.value;
      const meterMarkup = Array.from({ length: segmentCount }, (_, index) =>
        `<span class="seg${index < filled ? " seg--on" : ""}"></span>`
      ).join("");

      const name = this._esc(zone.name || zone.entity);
      const entity = this._esc(zone.entity);
      const levelText = info.value === null ? "–" : String(info.value);

      return `
        <div class="zone${isOn ? " zone--on" : ""}"
             style="--heat-top:${heatTop};--heat-bottom:${heatBottom};--heat-glow:${heatGlow};">
          <div class="quilt" aria-hidden="true"></div>
          <div class="zone-inner">
            <div class="zone-head">
              <div class="zone-name">${name}</div>
              <div class="zone-level"><span class="level-value">${levelText}</span><span class="level-max">/${info.max}</span></div>
            </div>
            <div class="meter" aria-hidden="true">${meterMarkup}</div>
            <div class="zone-controls">
              <button class="step" data-action="down" data-entity="${entity}" aria-label="Decrease ${name}">−</button>
              <select class="pick" data-entity="${entity}" aria-label="${name} level">
                ${optionsMarkup}
              </select>
              <button class="step" data-action="up" data-entity="${entity}" aria-label="Increase ${name}">+</button>
            </div>
          </div>
        </div>
      `;
    };

    const renderTimer = (timer) => {
      if (!timer) {
        return `<div class="timer-card timer-card--empty" aria-hidden="true"></div>`;
      }

      const timerSelectEntity = timer.timer_select_entity;
      const timerSensorEntity = timer.timer_sensor_entity;
      const stopButtonEntity = timer.stop_button_entity;

      const timerSelectState = timerSelectEntity ? this._hass.states[timerSelectEntity] : undefined;
      const timerCurrent = timerSelectState ? String(timerSelectState.state) : "";
      const timerOptions = (timerSelectState && timerSelectState.attributes && timerSelectState.attributes.options) || [];
      const timerOptionsMarkup = timerOptions
        .map((opt) => {
          const selected = String(opt) === timerCurrent ? " selected" : "";
          return `<option value="${this._esc(opt)}"${selected}>${this._esc(opt)}</option>`;
        })
        .join("");

      const timerRemaining = timerSensorEntity && this._hass.states[timerSensorEntity]
        ? this._hass.states[timerSensorEntity].state
        : "";

      const name = this._esc(timer.name || "Timer");

      return `
        <div class="timer-card">
          <div class="timer-title">${name}</div>
          ${timerSelectEntity ? `<label class="timer-field">Duration <select class="timer-pick" data-entity="${this._esc(timerSelectEntity)}" aria-label="${name} duration">${timerOptionsMarkup}</select></label>` : ""}
          ${timerSensorEntity ? `<div class="timer-readout"><span>Remaining</span><strong>${this._esc(timerRemaining)}</strong></div>` : ""}
          ${stopButtonEntity ? `<button class="stop" data-entity="${this._esc(stopButtonEntity)}">Stop</button>` : ""}
        </div>
      `;
    };

    const columns = layout.sides.length;
    const pillowsMarkup = layout.sides
      .map((side) => `<div class="pillow"><span>${this._esc(this._sideLabel(side))}</span></div>`)
      .join("");
    const zonesMarkup = layout.rows.map((row) => row.map(renderZone).join("")).join("");
    const timersMarkup = layout.timerRows.map((row) => row.map(renderTimer).join("")).join("");

    this._root.innerHTML = `
      <ha-card>
        <div class="wrap" style="--cols:${columns};">
          <div class="title">${this._esc(title)}</div>
          <div class="bed bed--${layoutMode}">
            <div class="headboard" aria-hidden="true"></div>
            <div class="mattress">
              <div class="pillows">${pillowsMarkup}</div>
              <div class="zone-grid">${zonesMarkup}</div>
              <div class="duvet" aria-hidden="true"><span class="stitch"></span></div>
            </div>
            <div class="footboard" aria-hidden="true"></div>
          </div>
          ${timersMarkup ? `<div class="timers">${timersMarkup}</div>` : ""}
        </div>
      </ha-card>
      <style>
        :host {
          display: block;
        }

        .wrap {
          padding: 14px;
          container-type: inline-size;
        }

        .title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 12px;
          color: var(--primary-text-color);
        }

        .bed {
          --seg-off: rgba(34, 48, 63, 0.14);
          --frame: #8a6242;
          --frame-dark: #52381f;
          --sheet: #f2f5fa;
          --sheet-shade: #dde4ef;
          --ink: #22303f;
          position: relative;
          padding: 10px;
          border-radius: 26px 26px 16px 16px;
          background: linear-gradient(180deg, var(--frame) 0%, var(--frame-dark) 100%);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          color: var(--ink);
        }

        .headboard {
          height: 26px;
          margin-bottom: 9px;
          border-radius: 18px 18px 6px 6px;
          background:
            repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.16) 0 2px, rgba(0, 0, 0, 0) 2px 24px),
            linear-gradient(180deg, #a2764f 0%, #7a5535 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }

        .mattress {
          display: grid;
          gap: 10px;
          padding: 10px;
          border-radius: 16px;
          background: linear-gradient(180deg, var(--sheet) 0%, var(--sheet-shade) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 3px 8px rgba(0, 0, 0, 0.22);
        }

        .pillows,
        .zone-grid,
        .timers {
          display: grid;
          grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
          gap: 10px;
        }

        .pillow {
          height: 42px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(34, 48, 63, 0.5);
          background: linear-gradient(180deg, #ffffff 0%, #e9eef6 100%);
          box-shadow:
            inset 0 2px 0 rgba(255, 255, 255, 0.95),
            inset 0 -8px 14px rgba(34, 48, 63, 0.07),
            0 2px 5px rgba(0, 0, 0, 0.16);
        }

        .zone {
          position: relative;
          isolation: isolate;
          min-height: 130px;
          padding: 10px;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          background-color: rgba(255, 255, 255, 0.72);
          background-image: linear-gradient(180deg, var(--heat-top, transparent) 0%, var(--heat-bottom, transparent) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 4px rgba(0, 0, 0, 0.12);
          transition: box-shadow 0.25s ease, background-image 0.25s ease;
        }

        .zone--on {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.85),
            0 1px 4px rgba(0, 0, 0, 0.12),
            0 0 20px var(--heat-glow, transparent);
        }

        .zone--empty {
          min-height: 0;
          background-image: none;
          background-color: rgba(255, 255, 255, 0.4);
        }

        .quilt {
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0.75;
          background-image:
            repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.4) 0 1px, rgba(0, 0, 0, 0) 1px 22px),
            repeating-linear-gradient(-45deg, rgba(34, 48, 63, 0.06) 0 1px, rgba(0, 0, 0, 0) 1px 22px);
        }

        .zone-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          height: 100%;
        }

        .zone-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 6px;
        }

        .zone-name {
          font-weight: 700;
          font-size: 0.92rem;
        }

        .zone-level {
          white-space: nowrap;
        }

        .level-value {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1;
        }

        .level-max {
          font-size: 0.78rem;
          opacity: 0.6;
        }

        .meter {
          display: flex;
          gap: 3px;
        }

        .seg {
          flex: 1 1 auto;
          height: 6px;
          border-radius: 3px;
          background: var(--seg-off, rgba(34, 48, 63, 0.14));
        }

        .seg--on {
          background: linear-gradient(90deg, #ffb454 0%, #ff6f1a 100%);
          box-shadow: 0 0 6px rgba(255, 122, 26, 0.55);
        }

        .zone-controls {
          margin-top: auto;
          display: grid;
          grid-template-columns: 34px 1fr 34px;
          gap: 6px;
          align-items: center;
        }

        .step {
          height: 34px;
          border-radius: 50%;
          border: 1px solid rgba(34, 48, 63, 0.18);
          background: rgba(255, 255, 255, 0.9);
          color: var(--ink);
          font-size: 1.1rem;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
        }

        .step:hover {
          background: #ffffff;
        }

        .pick {
          height: 34px;
          border-radius: 17px;
          border: 1px solid rgba(34, 48, 63, 0.18);
          background: rgba(255, 255, 255, 0.9);
          color: var(--ink);
          padding: 0 8px;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .duvet {
          position: relative;
          height: 22px;
          border-radius: 11px;
          background: linear-gradient(180deg, #ffffff 0%, #e4eaf5 100%);
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.95), 0 -4px 10px rgba(34, 48, 63, 0.08);
        }

        .stitch {
          position: absolute;
          left: 14px;
          right: 14px;
          top: 10px;
          height: 1px;
          background: repeating-linear-gradient(90deg, rgba(34, 48, 63, 0.25) 0 5px, rgba(0, 0, 0, 0) 5px 10px);
        }

        .footboard {
          height: 12px;
          margin-top: 9px;
          border-radius: 6px 6px 12px 12px;
          background: linear-gradient(180deg, #a2764f 0%, #5f4227 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .timers {
          margin-top: 12px;
        }

        .timer-card {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 10px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
          border-left: 4px solid rgba(255, 138, 46, 0.85);
          background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
          color: var(--primary-text-color);
        }

        .timer-card--empty {
          border: none;
          background: none;
          padding: 0;
        }

        .timer-title {
          flex: 1 0 100%;
          font-weight: 700;
        }

        .timer-field {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          opacity: 0.85;
        }

        .timer-pick {
          height: 30px;
          border-radius: 15px;
          border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.18));
          background: var(--card-background-color, #ffffff);
          color: var(--primary-text-color);
          padding: 0 8px;
          font-size: 0.88rem;
          cursor: pointer;
        }

        .timer-readout {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          font-size: 0.85rem;
        }

        .timer-readout span {
          opacity: 0.7;
        }

        .stop {
          margin-left: auto;
          height: 32px;
          padding: 0 14px;
          border-radius: 16px;
          border: none;
          background: var(--error-color, #c0392b);
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
        }

        .bed--plain {
          --ink: var(--primary-text-color);
          --seg-off: var(--divider-color, rgba(34, 48, 63, 0.14));
          padding: 0;
          border-radius: 0;
          background: none;
          box-shadow: none;
          color: var(--primary-text-color);
        }

        .bed--plain .headboard,
        .bed--plain .footboard,
        .bed--plain .pillows,
        .bed--plain .duvet,
        .bed--plain .quilt {
          display: none;
        }

        .bed--plain .mattress {
          padding: 0;
          background: none;
          box-shadow: none;
        }

        .bed--plain .zone {
          background-color: var(--card-background-color, rgba(255, 255, 255, 0.72));
          border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
          box-shadow: none;
        }

        .bed--plain .zone--on {
          box-shadow: 0 0 16px var(--heat-glow, transparent);
        }

        .bed--plain .step,
        .bed--plain .pick {
          background: var(--card-background-color, #ffffff);
          border-color: var(--divider-color, rgba(0, 0, 0, 0.18));
        }

        .bed--plain .step:hover {
          background: var(--secondary-background-color, #ffffff);
        }

        @container (max-width: 420px) {
          .zone {
            min-height: 118px;
            padding: 8px;
          }

          .zone-name {
            font-size: 0.82rem;
          }

          .level-value {
            font-size: 1.25rem;
          }

          .zone-controls {
            grid-template-columns: 30px 1fr 30px;
            gap: 4px;
          }

          .step {
            height: 30px;
          }

          .pick {
            height: 30px;
            font-size: 0.82rem;
          }

          .timers {
            grid-template-columns: 1fr;
          }

          .pillow {
            height: 34px;
          }
        }
      </style>
    `;

    this._root.querySelectorAll("button.step").forEach((button) => {
      button.addEventListener("click", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        const action = ev.currentTarget.getAttribute("data-action");
        this._stepLevel(entity, action === "up" ? 1 : -1);
      });
    });

    this._root.querySelectorAll("select.pick").forEach((select) => {
      select.addEventListener("change", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        const value = ev.currentTarget.value;
        this._selectOption(entity, value);
      });
    });

    this._root.querySelectorAll("select.timer-pick").forEach((timerPick) => {
      timerPick.addEventListener("change", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        this._selectOption(entity, ev.currentTarget.value);
      });
    });

    this._root.querySelectorAll("button.stop").forEach((stop) => {
      stop.addEventListener("click", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        this._hass.callService("button", "press", { entity_id: entity });
      });
    });
  }

  _stepLevel(entityId, delta) {
    const stateObj = this._hass.states[entityId];
    if (!stateObj || !stateObj.attributes || !Array.isArray(stateObj.attributes.options)) {
      return;
    }

    const options = stateObj.attributes.options.map((o) => String(o));
    const currentIndex = options.indexOf(String(stateObj.state));
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = Math.min(options.length - 1, Math.max(0, currentIndex + delta));
    this._selectOption(entityId, options[nextIndex]);
  }

  _selectOption(entityId, option) {
    this._hass.callService("select", "select_option", {
      entity_id: entityId,
      option: String(option),
    });
  }

  static getConfigElement() {
    return document.createElement("beurer-cosynight-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Beurer CosyNight",
      layout: "bed",
      zones: [
        { name: "Left Body", entity: "", colour_style: "body" },
        { name: "Right Body", entity: "", colour_style: "body" },
        { name: "Left Feet", entity: "", colour_style: "feet" },
        { name: "Right Feet", entity: "", colour_style: "feet" },
      ],
      timers: [
        { name: "Left Side", timer_select_entity: "", timer_sensor_entity: "", stop_button_entity: "" },
        { name: "Right Side", timer_select_entity: "", timer_sensor_entity: "", stop_button_entity: "" },
      ],
    };
  }
}

if (!customElements.get("beurer-cosynight-card")) {
  customElements.define("beurer-cosynight-card", BeurerCosyNightCard);
}

class BeurerCosyNightCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
  }

  setHass(hass) {
    this.hass = hass;
  }

  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  get _title() {
    return this._config.title || "Beurer CosyNight";
  }

  get _zones() {
    return this._config.zones || [];
  }

  get _layout() {
    return String(this._config.layout || "bed").toLowerCase() === "plain" ? "plain" : "bed";
  }

  get _timerSelectEntity() {
    return this._config.timer_select_entity || "";
  }

  get _timerSensorEntity() {
    return this._config.timer_sensor_entity || "";
  }

  get _stopButtonEntity() {
    return this._config.stop_button_entity || "";
  }

  get _timers() {
    if (Array.isArray(this._config.timers)) {
      return this._config.timers;
    }
    if (this._config.timer_select_entity || this._config.timer_sensor_entity || this._config.stop_button_entity) {
      return [
        {
          name: this._config.timer_name || "Timer",
          timer_select_entity: this._config.timer_select_entity || "",
          timer_sensor_entity: this._config.timer_sensor_entity || "",
          stop_button_entity: this._config.stop_button_entity || "",
        },
      ];
    }
    return [];
  }

  _normaliseColourStyle(zone) {
    const raw = String(zone.colour_style || zone.tone || "body");
    if (raw === "feet_left" || raw === "feet_right") {
      return "feet";
    }
    return raw === "feet" ? "feet" : "body";
  }

  _render() {
    this.innerHTML = `
      <div style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <label>
            Card Title:
            <input type="text" id="title" value="${this._title}" 
              style="width: 200px; padding: 6px; margin-left: 8px;">
          </label>
        </div>

        <div style="margin-bottom: 16px;">
          <label>
            Layout:
            <select id="layout" style="padding: 6px; margin-left: 8px;">
              <option value="bed"${this._layout === "bed" ? " selected" : ""}>Bed (styled headboard, pillows &amp; duvet)</option>
              <option value="plain"${this._layout === "plain" ? " selected" : ""}>Plain tiles</option>
            </select>
          </label>
        </div>

        <div style="margin-bottom: 16px;">
          <h3>Zones</h3>
          <div id="zones-container"></div>
          <button id="add-zone" style="margin-top: 8px; padding: 6px 12px;">+ Add Zone</button>
        </div>

        <div style="margin-bottom: 16px;">
          <h3>Timers</h3>
          <div id="timers-container"></div>
          <button id="add-timer" style="margin-top: 8px; padding: 6px 12px;">+ Add Timer Row</button>
        </div>
      </div>
    `;

    const titleInput = this.querySelector("#title");
    titleInput.addEventListener("change", () => this._updateConfig());

    const layoutSelect = this.querySelector("#layout");
    layoutSelect.addEventListener("change", () => this._updateConfig());

    const addZoneBtn = this.querySelector("#add-zone");
    addZoneBtn.addEventListener("click", () => this._addZone());

    const addTimerBtn = this.querySelector("#add-timer");
    addTimerBtn.addEventListener("click", () => this._addTimer());

    this._renderZones();
    this._renderTimers();
  }

  _renderZones() {
    const container = this.querySelector("#zones-container");
    container.innerHTML = this._zones
      .map((zone, idx) => {
        const styles = ["body", "feet"];
        const styleOptions = styles
          .map((style) => {
            const selected = this._normaliseColourStyle(zone) === style ? " selected" : "";
            return `<option value="${style}"${selected}>${style}</option>`;
          })
          .join("");

        return `
          <div style="margin-bottom: 12px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <div>
              <label>Name: <input type="text" class="zone-name" data-idx="${idx}" value="${zone.name || ""}" style="width: 150px; padding: 4px; margin: 0 8px;"></label>
            </div>
            <div>
              <label>Entity: <input type="text" class="zone-entity" data-idx="${idx}" value="${zone.entity || ""}" style="width: 200px; padding: 4px; margin: 0 8px;" placeholder="select.zone"></label>
            </div>
            <div>
              <label>Colour Style: <select class="zone-colour-style" data-idx="${idx}" style="padding: 4px; margin: 0 8px;">${styleOptions}</select></label>
              <button class="remove-zone" data-idx="${idx}" style="padding: 4px 8px; margin-left: 8px;">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    this.querySelectorAll(".zone-name, .zone-entity, .zone-colour-style").forEach((input) => {
      input.addEventListener("change", () => this._updateConfig());
    });

    this.querySelectorAll(".remove-zone").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
        this._removeZone(idx);
      });
    });
  }

  _addZone() {
    this._config.zones = this._config.zones || [];
    this._config.zones.push({ name: "New Zone", entity: "", colour_style: "body" });
    this._render();
    this._updateConfig();
  }

  _renderTimers() {
    const container = this.querySelector("#timers-container");
    container.innerHTML = this._timers
      .map((timer, idx) => `
        <div style="margin-bottom: 12px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <div>
            <label>Name: <input type="text" class="timer-name" data-idx="${idx}" value="${timer.name || ""}" style="width: 150px; padding: 4px; margin: 0 8px;"></label>
          </div>
          <div>
            <label>Timer Select Entity: <input type="text" class="timer-select" data-idx="${idx}" value="${timer.timer_select_entity || ""}" style="width: 240px; padding: 4px; margin: 0 8px;" placeholder="select.timer"></label>
          </div>
          <div>
            <label>Timer Sensor Entity: <input type="text" class="timer-sensor" data-idx="${idx}" value="${timer.timer_sensor_entity || ""}" style="width: 240px; padding: 4px; margin: 0 8px;" placeholder="sensor.timer"></label>
          </div>
          <div>
            <label>Stop Button Entity: <input type="text" class="timer-stop" data-idx="${idx}" value="${timer.stop_button_entity || ""}" style="width: 240px; padding: 4px; margin: 0 8px;" placeholder="button.stop"></label>
            <button class="remove-timer" data-idx="${idx}" style="padding: 4px 8px; margin-left: 8px;">Remove</button>
          </div>
        </div>
      `)
      .join("");

    this.querySelectorAll(".timer-name, .timer-select, .timer-sensor, .timer-stop").forEach((input) => {
      input.addEventListener("change", () => this._updateConfig());
    });

    this.querySelectorAll(".remove-timer").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
        this._removeTimer(idx);
      });
    });
  }

  _addTimer() {
    this._config.timers = this._timers.slice();
    this._config.timers.push({
      name: "Timer",
      timer_select_entity: "",
      timer_sensor_entity: "",
      stop_button_entity: "",
    });
    this._render();
    this._updateConfig();
  }

  _removeTimer(idx) {
    this._config.timers = this._timers.slice();
    this._config.timers.splice(idx, 1);
    this._render();
    this._updateConfig();
  }

  _removeZone(idx) {
    this._config.zones.splice(idx, 1);
    this._render();
    this._updateConfig();
  }

  _updateConfig() {
    const title = this.querySelector("#title").value;
    const layout = this.querySelector("#layout")?.value || this._layout;
    const zones = this._zones.map((zone, idx) => ({
      name: this.querySelector(`.zone-name[data-idx="${idx}"]`)?.value || zone.name,
      entity: this.querySelector(`.zone-entity[data-idx="${idx}"]`)?.value || zone.entity,
      colour_style: this.querySelector(`.zone-colour-style[data-idx="${idx}"]`)?.value || this._normaliseColourStyle(zone),
    }));

    const timers = this._timers.map((timer, idx) => ({
      name: this.querySelector(`.timer-name[data-idx="${idx}"]`)?.value || timer.name || "Timer",
      timer_select_entity: this.querySelector(`.timer-select[data-idx="${idx}"]`)?.value || timer.timer_select_entity,
      timer_sensor_entity: this.querySelector(`.timer-sensor[data-idx="${idx}"]`)?.value || timer.timer_sensor_entity,
      stop_button_entity: this.querySelector(`.timer-stop[data-idx="${idx}"]`)?.value || timer.stop_button_entity,
    })).filter((timer) => timer.timer_select_entity || timer.timer_sensor_entity || timer.stop_button_entity);

    const nextConfig = {
      ...this._config,
      title,
      layout,
      zones,
      timers,
    };

    // Backward-compatible first timer mirrors legacy fields.
    if (timers[0]) {
      nextConfig.timer_name = timers[0].name;
      nextConfig.timer_select_entity = timers[0].timer_select_entity;
      nextConfig.timer_sensor_entity = timers[0].timer_sensor_entity;
      nextConfig.stop_button_entity = timers[0].stop_button_entity;
    } else {
      nextConfig.timer_name = undefined;
      nextConfig.timer_select_entity = undefined;
      nextConfig.timer_sensor_entity = undefined;
      nextConfig.stop_button_entity = undefined;
    }

    this._config = nextConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: nextConfig },
        bubbles: true,
        composed: true,
      })
    );
  }
}

if (!customElements.get("beurer-cosynight-card-editor")) {
  customElements.define("beurer-cosynight-card-editor", BeurerCosyNightCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "beurer-cosynight-card")) {
  window.customCards.push({
    type: "beurer-cosynight-card",
    name: "Beurer CosyNight Card",
    description: "Control and view Beurer CosyNight heat zones and timer.",
    preview: false,
    configurable: true,
  });
}
