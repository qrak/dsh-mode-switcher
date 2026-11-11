/**
 * @qrak/dsh-mode-switcher — independent implementation.
 * Tab (unmodified) or the chip toggles Plan/Build; each mode keeps its own
 * model and reasoning preset. The Desktop window runs on the stable
 * dsh-app://app origin, so presets live in localStorage; the http web UI gets
 * a random port each launch, so a host-scoped cookie is the cross-origin copy.
 */
window.__ModuleLoader__.load({
  id: '@qrak/dsh-mode-switcher',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'mode-switcher';
    const PRESET_COOKIE = 'dsh_mode_switcher_presets_v1';
    const PRESET_MAX_AGE = 34560000;

    const I18N = {
      en: {
        'label.plan': 'Plan',
        'label.build': 'Build',
        'chip.plan.aria': 'Plan mode is on. Press to switch to Build mode (Tab).',
        'chip.build.aria': 'Build mode is on. Press to switch to Plan mode (Tab).',
        'chip.plan.title': 'Plan mode · {model} · Tab or click to switch',
        'chip.build.title': 'Build mode · {model} · Tab or click to switch',
        'chip.noPreset': 'no saved model',
        'chip.presets': 'plan: {plan} · build: {build}',
        'chip.memory': 'presets are kept in memory only (browser storage is unavailable)',
        'error.command': 'Mode switch failed: {message}',
        'error.model': 'Mode switched, but the saved model could not be restored: {message}',
      },
      pl: {
        'label.plan': 'Plan',
        'label.build': 'Build',
        'chip.plan.aria': 'Tryb Plan jest włączony. Naciśnij, aby przełączyć na Build (Tab).',
        'chip.build.aria': 'Tryb Build jest włączony. Naciśnij, aby przełączyć na Plan (Tab).',
        'chip.plan.title': 'Tryb Plan · {model} · Tab lub klik, aby przełączyć',
        'chip.build.title': 'Tryb Build · {model} · Tab lub klik, aby przełączyć',
        'chip.noPreset': 'brak zapisanego modelu',
        'chip.presets': 'plan: {plan} · build: {build}',
        'chip.memory': 'presety są tylko w pamięci (przeglądarka nie pozwala zapisać)',
        'error.command': 'Nie udało się przełączyć trybu: {message}',
        'error.model': 'Tryb przełączony, ale nie udało się przywrócić zapisanego modelu: {message}',
      },
      zh: {
        'label.plan': '计划',
        'label.build': '构建',
        'chip.plan.aria': '计划模式已开启。按此切换到构建模式（Tab）。',
        'chip.build.aria': '构建模式已开启。按此切换到计划模式（Tab）。',
        'chip.plan.title': '计划模式 · {model} · 按 Tab 或点击切换',
        'chip.build.title': '构建模式 · {model} · 按 Tab 或点击切换',
        'chip.noPreset': '尚未保存模型',
        'chip.presets': '计划: {plan} · 构建: {build}',
        'chip.memory': '预设仅保存在内存中（浏览器存储不可用）',
        'error.command': '切换模式失败：{message}',
        'error.model': '模式已切换，但无法恢复已保存的模型：{message}',
      },
    };

    function errorMessage(error) {
      return error instanceof Error ? error.message : String(error);
    }

    function normalizeModel(selection) {
      if (selection === null || typeof selection !== 'object') return null;
      const provider = typeof selection.provider === 'string' ? selection.provider.trim() : '';
      const model = typeof selection.model === 'string' ? selection.model.trim() : '';
      if (provider === '' || model === '') return null;
      const normalized = { provider, model };
      if (typeof selection.reasoningEffort === 'string' && selection.reasoningEffort.trim() !== '') {
        normalized.reasoningEffort = selection.reasoningEffort.trim();
      }
      return normalized;
    }

    function sameModel(a, b) {
      const left = normalizeModel(a);
      const right = normalizeModel(b);
      if (left === null || right === null) return false;
      return left.provider === right.provider &&
        left.model === right.model &&
        (left.reasoningEffort || '') === (right.reasoningEffort || '');
    }

    function emptyPresets() {
      return { plan: null, build: null };
    }

    function storedFrom(raw) {
      if (typeof raw !== 'string' || raw === '') return null;
      let data;
      try {
        data = JSON.parse(raw);
      } catch (_error) {
        return null;
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data) || data.v !== 1) {
        return null;
      }
      return {
        presets: {
          plan: normalizeModel(data.plan),
          build: normalizeModel(data.build),
        },
        savedAt: typeof data.savedAt === 'number' && Number.isFinite(data.savedAt) ? data.savedAt : 0,
      };
    }

    function parsePresets(raw) {
      const stored = storedFrom(raw);
      return stored === null ? emptyPresets() : stored.presets;
    }

    function serializePresets(presets) {
      return JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        plan: normalizeModel(presets && presets.plan),
        build: normalizeModel(presets && presets.build),
      });
    }

    function cookieString(name, value) {
      return `${name}=${encodeURIComponent(String(value))}; path=/; max-age=${PRESET_MAX_AGE}; SameSite=Lax`;
    }

    function readCookie(name, cookie) {
      const raw = typeof cookie === 'string'
        ? cookie
        : (typeof document === 'undefined' ? '' : document.cookie);
      const prefix = `${name}=`;
      for (const part of raw.split(';')) {
        const entry = part.trim();
        if (!entry.startsWith(prefix)) continue;
        try {
          return decodeURIComponent(entry.slice(prefix.length));
        } catch (_error) {
          return null;
        }
      }
      return null;
    }

    function readLocalPresets() {
      if (typeof localStorage === 'undefined') return null;
      try {
        return storedFrom(localStorage.getItem(PRESET_COOKIE));
      } catch (_error) {
        return null;
      }
    }

    let memoryPresets = null;

    function getPresets() {
      const cookieStored = storedFrom(readCookie(PRESET_COOKIE));
      const localStored = readLocalPresets();
      if (cookieStored !== null && localStored !== null) {
        return cookieStored.savedAt >= localStored.savedAt ? cookieStored.presets : localStored.presets;
      }
      if (cookieStored !== null) return cookieStored.presets;
      if (localStored !== null) return localStored.presets;
      return memoryPresets === null ? emptyPresets() : { ...memoryPresets };
    }

    function savePresets(presets) {
      const normalized = {
        plan: normalizeModel(presets && presets.plan),
        build: normalizeModel(presets && presets.build),
      };
      memoryPresets = normalized;
      const raw = serializePresets(normalized);
      if (typeof document !== 'undefined') {
        try {
          document.cookie = cookieString(PRESET_COOKIE, raw);
        } catch (_error) {
          // Some custom schemes reject cookies; localStorage and memory remain.
        }
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(PRESET_COOKIE, raw);
        } catch (_error) {
          // Quota/privacy modes; memory remains for this page lifetime.
        }
      }
      return normalized;
    }

    function storageStatus() {
      if (storedFrom(readCookie(PRESET_COOKIE)) !== null) return 'cookie';
      if (readLocalPresets() !== null) return 'local';
      return 'memory';
    }

    function modeKey(isPlan) {
      return isPlan ? 'plan' : 'build';
    }

    function toggleTabAllowed(event, menuOpen) {
      if (!event || event.key !== 'Tab' || event.repeat) return false;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
      if (event.isComposing === true) return false;
      return menuOpen !== true;
    }

    function decide(state, observation) {
      const mode = Boolean(observation.mode);
      const model = normalizeModel(observation.model);
      const next = { mode, model };
      if (state.mode === null) return { state: next, action: 'restore' };
      if (observation.switching === true) return { state: next, action: 'none' };
      if (state.mode !== mode) return { state: next, action: 'restore' };
      if (model === null) return { state: next, action: 'none' };
      if (state.model === null) return { state: next, action: 'restore' };
      if (!sameModel(model, state.model)) return { state: next, action: 'save' };
      return { state: next, action: 'none' };
    }

    function translate(t, key, variables) {
      let text;
      if (typeof t === 'function') {
        try {
          text = t(key, variables);
        } catch (_error) {
          text = undefined;
        }
      }
      if (typeof text !== 'string' || text === '' || text === key) text = I18N.en[key] || key;
      if (variables) {
        for (const [name, value] of Object.entries(variables)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    }

    const sessionTrackers = new Map();

    function getTracker(sessionId) {
      let tracker = sessionTrackers.get(sessionId);
      if (tracker === undefined) {
        tracker = { state: { mode: null, model: null }, switching: false };
        sessionTrackers.set(sessionId, tracker);
      }
      return tracker;
    }

    async function selectSessionModel(ctx, sessionId, model) {
      const request = { sessionId, provider: model.provider, model: model.model };
      if (model.reasoningEffort) request.reasoningEffort = model.reasoningEffort;
      await ctx.remote.session.selectModel(request);
    }

    async function toggleMode(ctx, sessionId, currentPlan, currentSelection) {
      if (!sessionId) return { ok: false, kind: 'command', error: 'no active session' };
      const tracker = getTracker(sessionId);
      if (tracker.switching) return { ok: false, silent: true, error: '' };

      const current = normalizeModel(currentSelection);
      const targetPlan = !Boolean(currentPlan);
      const sourceKey = modeKey(Boolean(currentPlan));
      const targetKey = modeKey(targetPlan);
      const presets = getPresets();

      if (current) {
        presets[sourceKey] = current;
        savePresets(presets);
      }
      const target = normalizeModel(presets[targetKey]) || current;
      if (target && !presets[targetKey]) {
        presets[targetKey] = target;
        savePresets(presets);
      }

      tracker.switching = true;
      let commandOk = false;
      try {
        const result = await ctx.remote.commands.execute(sessionId, targetPlan ? '/plan' : '/plan off', []);
        if (!result || result.ok !== true || result.value === undefined) {
          const message = result && result.error && result.error.message
            ? result.error.message
            : 'unknown command';
          return { ok: false, kind: 'command', error: message };
        }
        commandOk = true;
        if (target && !sameModel(target, current)) {
          await selectSessionModel(ctx, sessionId, target);
        }
        return { ok: true };
      } catch (error) {
        const message = errorMessage(error);
        if (commandOk) {
          const cleared = getPresets();
          cleared[targetKey] = null;
          savePresets(cleared);
          return { ok: false, kind: 'model', error: message };
        }
        return { ok: false, kind: 'command', error: message };
      } finally {
        tracker.switching = false;
      }
    }

    function isComposerElement(element) {
      return element.getAttribute('contenteditable') === 'true' ||
        element.getAttribute('data-composer-input') !== null ||
        element.closest('[data-composer-card]') !== null ||
        element.closest('[data-input-scroll]') !== null;
    }

    function composerMenuOpen() {
      return document.querySelector('[data-composer-overlay] [role="listbox"]') !== null ||
        document.querySelector('[role="listbox"]') !== null;
    }

    const active = {
      sessionId: null,
      isPlan: false,
      locked: false,
      toggle: null,
      currentSelection: null,
      report: null,
    };

    function ModeChip(props) {
      const { sessionId, locked, useProjection, toggleMode: toggle, applyModel, t } = props;
      const plan = useProjection('plan');
      const modelSelection = useProjection('modelSelection');
      const target = plan === undefined ? false : (plan.pending ? !plan.active : plan.active);
      const currentSelection = (modelSelection && (modelSelection.next || modelSelection.lastUsed)) || null;
      const tracker = getTracker(sessionId);

      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [hover, setHover] = useState(false);
      const [focused, setFocused] = useState(false);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
          if (sessionTrackers.get(sessionId) === tracker) sessionTrackers.delete(sessionId);
        };
      }, [sessionId, tracker]);

      const report = (result) => {
        if (!alive.current) return;
        if (result && result.ok === true) {
          setError(null);
          return;
        }
        if (!result || result.ok !== false || result.silent) return;
        setError(translate(t, result.kind === 'model' ? 'error.model' : 'error.command', {
          message: result.error || '',
        }));
      };

      useEffect(() => {
        active.sessionId = sessionId;
        active.isPlan = target;
        active.locked = Boolean(locked);
        active.toggle = toggle;
        active.currentSelection = currentSelection;
        active.report = report;
        return () => {
          if (active.sessionId === sessionId) {
            active.toggle = null;
            active.report = null;
          }
        };
      }, [sessionId, target, locked, toggle, currentSelection, report]);

      useEffect(() => {
        if (!sessionId || plan === undefined) return;
        const decision = decide(tracker.state, {
          mode: target,
          model: currentSelection,
          switching: tracker.switching,
        });
        tracker.state = decision.state;
        if (decision.action === 'none') return;

        const key = modeKey(decision.state.mode);
        const presets = getPresets();
        if (decision.action === 'restore') {
          const saved = normalizeModel(presets[key]);
          if (saved === null) {
            if (decision.state.model) {
              presets[key] = decision.state.model;
              savePresets(presets);
            }
            return;
          }
          if (decision.state.model && sameModel(saved, decision.state.model)) return;
          Promise.resolve(applyModel(saved)).catch((failure) => {
            const cleared = getPresets();
            cleared[key] = null;
            savePresets(cleared);
            if (alive.current) {
              setError(translate(t, 'error.model', { message: errorMessage(failure) }));
            }
          });
          return;
        }
        if (decision.action === 'save' && decision.state.model) {
          presets[key] = decision.state.model;
          savePresets(presets);
        }
      }, [sessionId, plan, target, currentSelection, applyModel, tracker]);

      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (busy || locked || !toggle) return;
        setError(null);
        setBusy(true);
        Promise.resolve(toggle(target, currentSelection)).then(
          (result) => report(result),
          (failure) => {
            if (alive.current) {
              setError(translate(t, 'error.command', { message: errorMessage(failure) }));
            }
          },
        ).finally(() => {
          if (alive.current) setBusy(false);
        });
      };

      if (plan === undefined) return null;

      const isPlan = target;
      const disabled = Boolean(locked) || busy;
      const model = normalizeModel(currentSelection);
      const modelText = model === null
        ? translate(t, 'chip.noPreset')
        : `${model.model}${model.reasoningEffort ? ` · ${model.reasoningEffort}` : ''}`;
      const label = translate(t, isPlan ? 'label.plan' : 'label.build');
      const saved = getPresets();
      const formatPreset = (model) => model === null
        ? '—'
        : `${model.model}${model.reasoningEffort ? ` · ${model.reasoningEffort}` : ''}`;
      const presetLine = translate(t, 'chip.presets', {
        plan: formatPreset(saved.plan),
        build: formatPreset(saved.build),
      });
      const storageLine = storageStatus() === 'memory' ? translate(t, 'chip.memory') : '';
      const baseTitle = translate(t, isPlan ? 'chip.plan.title' : 'chip.build.title', { model: modelText });
      const title = `${baseTitle}\n${presetLine}${storageLine === '' ? '' : `\n${storageLine}`}`;
      const aria = translate(t, isPlan ? 'chip.plan.aria' : 'chip.build.aria');
      const tone = isPlan
        ? { background: 'var(--dsw-alias-state-warn-tertiary, #fff7e6)', color: 'var(--dsw-alias-state-warn-label, #dd8629)' }
        : { background: 'var(--dsw-alias-state-business-tertiary, #e6f4ff)', color: 'var(--dsw-alias-state-business-primary, #1677ff)' };

      return h('button', {
        type: 'button',
        'data-mode-switcher': isPlan ? 'plan' : 'build',
        'aria-label': error ? `${aria} ${error}` : aria,
        'aria-pressed': isPlan,
        title: error ? `${title}\n${error}` : title,
        disabled,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          height: '28px',
          padding: '0 8px',
          border: 'none',
          borderRadius: 'var(--dsw-radius-sm, 6px)',
          background: hover && !disabled
            ? `color-mix(in srgb, ${tone.background}, ${tone.color} 8%)`
            : tone.background,
          color: tone.color,
          font: 'inherit',
          fontSize: '13px',
          fontWeight: 600,
          lineHeight: '20px',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          outline: 'none',
          boxShadow: focused ? '0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))' : 'none',
          transition: 'background-color 120ms ease',
        },
        onClick,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
      }, [
        h('span', { key: 'icon', 'aria-hidden': true, style: { fontSize: '13px', lineHeight: '1' } }, isPlan ? '📋' : '🛠️'),
        h('span', { key: 'label' }, label),
        h('span', {
          key: 'hint',
          'aria-hidden': true,
          style: {
            fontSize: '10px',
            lineHeight: '1',
            padding: '2px 4px',
            borderRadius: '3px',
            background: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
          },
        }, 'Tab'),
        error ? h('span', { key: 'error', 'aria-hidden': true, style: { fontWeight: 700 } }, '⚠') : null,
      ]);
    }

    return {
      inject: ['slots', 'remote', 'remote.commands', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: I18N.en, pl: I18N.pl, zh: I18N.zh }), 'mode-switcher: dictionaries');

        ctx.effect(() => {
          const onKeyDown = (event) => {
            if (event.defaultPrevented) return;
            if (!active.toggle || active.locked) return;
            if (!toggleTabAllowed(event, composerMenuOpen())) return;
            const element = document.activeElement;
            if (!element || !isComposerElement(element)) return;
            event.preventDefault();
            event.stopPropagation();
            Promise.resolve(active.toggle(active.isPlan, active.currentSelection)).then(
              (result) => active.report?.(result),
              (failure) => active.report?.({ ok: false, kind: 'command', error: errorMessage(failure) }),
            );
          };
          window.addEventListener('keydown', onKeyDown, true);
          return () => window.removeEventListener('keydown', onKeyDown, true);
        }, 'mode-switcher: tab listener');

        ctx.slots.inject('conversation.input.plan', () => ctx.slots.register({
          name: 'conversation.input.plan',
          priority: -10,
          locale: NS,
          inject: (sessionId) => ({
            sessionId,
            toggleMode: (currentPlan, currentSelection) => toggleMode(ctx, sessionId, currentPlan, currentSelection),
            applyModel: (model) => selectSessionModel(ctx, sessionId, model),
          }),
        }, ModeChip));
      },
      __test: {
        NS,
        PRESET_COOKIE,
        normalizeModel,
        sameModel,
        storedFrom,
        parsePresets,
        serializePresets,
        cookieString,
        readCookie,
        getPresets,
        savePresets,
        storageStatus,
        toggleTabAllowed,
        decide,
      },
    };
  },
});
