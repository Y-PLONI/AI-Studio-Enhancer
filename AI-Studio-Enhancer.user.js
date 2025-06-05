// ==UserScript==
// @name         משולבים 1
// @namespace    https://example.com/
// @version      0.1
// @description  שלושה פיצ'רים משולבים ל‑aistudio.google.com: סרגל‑התקדמות, RTL ובועות. ניתן להפעיל/לבטל כל אחד בהגדרות, ללא innerHTML.
// @author       Y-PLONI
// @match        https://aistudio.google.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://github.com/Y-PLONI/AI-Studio-Enhancer/raw/refs/heads/main/AI-Studio-Enhancer.user.js
// @downloadURL  https://github.com/Y-PLONI/AI-Studio-Enhancer/raw/refs/heads/main/AI-Studio-Enhancer.user.js
// ==/UserScript==

(() => {
  'use strict';

  /*──────────────────────────────────
    0. ניהול הגדרות ותפריט
  ──────────────────────────────────*/
  const DEFAULTS = { sidebar: true, rtl: true, bubbles: true };
  const SETTINGS_KEY = 'aisEnhancerSettings';
  const settings = Object.assign({}, DEFAULTS, GM_getValue(SETTINGS_KEY, {}));

  function saveAndReload() {
    GM_setValue(SETTINGS_KEY, settings);
    location.reload();
  }

  // תפריט Violentmonkey
  GM_registerMenuCommand('⚙️ הגדרות כלי עזר וסרגל צד', openSettings);

  function openSettings() {
    if (document.getElementById('ais-enhancer-settings')) return; // כבר פתוח

    /* יצירת שכבת רקע */
    const overlay = document.createElement('div');
    overlay.id = 'ais-enhancer-settings';
    overlay.style.cssText = `position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;`;

    /* פאנל */
    const panel = document.createElement('div');
    panel.style.cssText = `background:#fff;color:#000;padding:18px 24px;border-radius:8px;min-width:260px;font:14px/1.4 sans-serif;direction:rtl;text-align:right;box-shadow:0 4px 14px rgba(0,0,0,.3);`;
    overlay.appendChild(panel);

    const title = document.createElement('h3');
    title.textContent = 'הגדרות כלי עזר';
    title.style.marginTop = '0';
    panel.appendChild(title);

    // צ׳קבוקסים
    [
      { key: 'sidebar', label: 'הצג סרגל צד' },
      { key: 'rtl',     label: 'תקן RTL' },
      { key: 'bubbles', label: 'בועות צבע' },
    ].forEach(({ key, label }) => {
      const row = document.createElement('label');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = settings[key];
      cb.addEventListener('change', () => { settings[key] = cb.checked; });

      const span = document.createElement('span');
      span.textContent = label;

      row.append(cb, span);
      panel.appendChild(row);
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'שמור והטען מחדש';
    saveBtn.style.cssText = 'margin-top:12px;padding:6px 14px;border-radius:4px;cursor:pointer;border:1px solid #888;background:#f0f0f0;';
    saveBtn.addEventListener('click', saveAndReload);
    panel.appendChild(saveBtn);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /*──────────────────────────────────
    1. סרגל‑התקדמות (Script 1)
  ──────────────────────────────────*/
  if (settings.sidebar) {
    // מקור: "תוסף עובד - 2" – ללא שינויים
    (() => {
      'use strict';

      const DEBUG = true;
      const debugLog  = DEBUG ? (...a)=>console.log('[AI Studio Sidebar]',...a) : ()=>{};
      const debugWarn = DEBUG ? (...a)=>console.warn('[AI Studio Sidebar]',...a) : ()=>{};

      /* קבועים */
      const SIDEBAR_ID   = 'ais-progress-sidebar';
      const DOT_CLASS    = 'ais-progress-dot';
      const OBS_DEBOUNCE = 300;
      const INIT_DELAY   = 2000;

      const COLOR_USER  = '#4CAF50';
      const COLOR_ASSIST= '#2196F3';

      let messages = [];
      let currentMessageIndex = -1;
      let chatContainer = null;
      let sidebar = null;
      let intersectionObserver = null;
      let mutationObserver      = null;
      let isInitialized         = false;
      let resizeListenerAttached= false;

      /*──────── Utilities ────────*/
      const debounce = (func, wait) => {
        let to;
        return (...args)=>{ clearTimeout(to); to=setTimeout(()=>func(...args), wait); };
      };

      const createElement = (tag, cls='', attrs={}) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
        return el;
      };

      /* בדיקה אם הודעת "חשיבה" */
      const isThinkingMessage = turn => (
        turn.querySelector('ms-thought-chunk') || turn.querySelector('.thought-panel')
      );

      /*──────── CSS ────────*/
      function injectStyles(){
        if (document.getElementById('ai-studio-sidebar-styles')) return;
        const style = createElement('style','',{id:'ai-studio-sidebar-styles'});
        style.textContent = `
          #${SIDEBAR_ID}{position:fixed;top:50%;transform:translateY(-50%);z-index:10000;display:flex;flex-direction:column;align-items:center;pointer-events:none;transition:opacity .3s,left .3s;opacity:0}
          #${SIDEBAR_ID}.visible{opacity:1}
          #${SIDEBAR_ID}::before{content:'';position:absolute;left:50%;top:0;width:4px;height:100%;background:#B0B0B0;border-radius:2px;transform:translateX(-50%);z-index:-1}
          #${SIDEBAR_ID} .${DOT_CLASS}{width:10px;height:10px;margin:6px 0;border-radius:50%;cursor:pointer;pointer-events:all;transition:transform .2s,box-shadow .2s;position:relative;z-index:1}
          #${SIDEBAR_ID} .${DOT_CLASS}.user{background:${COLOR_USER}}
          #${SIDEBAR_ID} .${DOT_CLASS}.model{background:${COLOR_ASSIST}}
          #${SIDEBAR_ID} .${DOT_CLASS}.active{transform:scale(1.4);box-shadow:0 0 10px rgba(0,0,0,.4)}
          #${SIDEBAR_ID} .${DOT_CLASS}:hover{transform:scale(1.3)}
          #${SIDEBAR_ID} .${DOT_CLASS}[title]:hover::after{content:attr(title);position:absolute;left:100%;top:50%;transform:translateY(-50%) translateX(8px);background:rgba(0,0,0,.8);color:#fff;padding:3px 6px;border-radius:3px;font-size:11px;white-space:nowrap;z-index:10002}
        `;
        document.head.appendChild(style);
      }

      /*──────── מבנה ה‑Sidebar ────────*/
      const createSidebar = ()=>{
        if (document.getElementById(SIDEBAR_ID)) return document.getElementById(SIDEBAR_ID);
        sidebar = createElement('div','',{id:SIDEBAR_ID});
        document.body.appendChild(sidebar);
        debugLog('Sidebar created');
        return sidebar;
      };

      /*──────── איתור הודעות ────────*/
      function findChatElements(){
        chatContainer = document.querySelector('ms-autoscroll-container') || document.querySelector('ms-chat-session');
        const allTurns = Array.from(document.querySelectorAll('ms-chat-turn'));
        if (!allTurns.length){ if(messages.length){messages=[];return true;} return false; }
        const filtered = allTurns.filter(el=>!isThinkingMessage(el));
        const newMsgs = filtered.map((el, i)=>{
          let role='unknown';
          const div=el.querySelector('div.chat-turn-container');
          if(div){ if(div.classList.contains('user')) role='user'; else if(div.classList.contains('model')) role='model'; }
          if(role==='unknown') role= i%2===0?'user':'model';
          return {element:el, role, index:i};
        });
        if(newMsgs.length!==messages.length || newMsgs.some((m,i)=>!messages[i]||messages[i].element!==m.element)){
          messages=newMsgs; return true;
        }
        return false;
      }

      /*──────── רינדור נקודות ────────*/
      function renderDots(){
        if(!sidebar) return;
        const existing=Array.from(sidebar.querySelectorAll(`.${DOT_CLASS}`));
        if(existing.length===messages.length && existing.every((d,i)=>+d.dataset.messageIndex===i)) return;
        existing.forEach(d=>d.remove());
        if(!messages.length){sidebar.classList.remove('visible');return;}
        messages.forEach((msg,i)=>{
          const dot=createElement('div',`${DOT_CLASS} ${msg.role}`,{'data-message-index':i});
          dot.title=`הודעה ${i+1} (${msg.role==='user'?'משתמש':'מודל'})`;
          dot.addEventListener('click',e=>{e.stopPropagation();scrollToMessage(i);});
          sidebar.appendChild(dot);
        });
        updateSidebarPosition();
        sidebar.classList.add('visible');
        if(intersectionObserver) intersectionObserver.disconnect();
        setupIntersectionObserver();
      }

      /*──────── מיקום ────────*/
      const positionSidebar=()=>{
        if(!sidebar) return;
        let ref=document.querySelector('ms-chat-turn')||messages[0]?.element;
        const rect=ref?.getBoundingClientRect();
        sidebar.style.left=rect?`${Math.max(rect.left-30,8)}px`:'12px';
      };
      const updateSidebarPosition=positionSidebar;

      /*──────── גלילה ────────*/
      const scrollToMessage=i=>{ if(i<0||i>=messages.length) return; messages[i].element.scrollIntoView({behavior:'smooth',block:'center'}); updateActiveDot(i); };
      const updateActiveDot=i=>{
        if(!sidebar||currentMessageIndex===i) return; currentMessageIndex=i;
        sidebar.querySelectorAll(`.${DOT_CLASS}`).forEach(d=>d.classList.remove('active'));
        const active=sidebar.querySelector(`.${DOT_CLASS}[data-message-index="${i}"]`); if(active) active.classList.add('active');
      };

      /*──────── IntersectionObserver ────────*/
      function setupIntersectionObserver(){
        if(intersectionObserver) intersectionObserver.disconnect();
        if(!chatContainer||!messages.length) return;
        intersectionObserver=new IntersectionObserver(entries=>{
          let best=null, ratio=0;
          entries.forEach(e=>{ if(e.isIntersecting&&e.intersectionRatio>ratio){ratio=e.intersectionRatio;best=e;} });
          if(best){ const idx=messages.findIndex(m=>m.element===best.target); if(idx>-1&&idx!==currentMessageIndex) updateActiveDot(idx); }
        },{root:chatContainer,rootMargin:'-40% 0px -40% 0px',threshold:0.01});
        messages.forEach(m=>intersectionObserver.observe(m.element));
      }

      /*──────── MutationObserver ────────*/
      const debouncedRebuild = debounce(()=>{ if(findChatElements()) renderDots(); positionSidebar(); }, OBS_DEBOUNCE);
      const setupMutationObserver=()=>{
        if(mutationObserver) return;
        const target=document.querySelector('ms-chat-session')||document.body;
        mutationObserver=new MutationObserver(debouncedRebuild);
        mutationObserver.observe(target,{childList:true,subtree:true});
      };

      /*──────── Resize ────────*/
      const setupResize=()=>{
        if(resizeListenerAttached) return;
        window.addEventListener('resize',debounce(()=>{positionSidebar(); if(chatContainer) setupIntersectionObserver();},200));
        resizeListenerAttached=true;
      };

      /*──────── Init ────────*/
      function init(){
        if(isInitialized) return;
        injectStyles();
        sidebar=createSidebar();
        if(findChatElements()) renderDots(); else debugLog('Waiting for messages…');
        positionSidebar();
        setupMutationObserver();
        setupResize();
        isInitialized=true;
      }

      (document.readyState==='loading') ? document.addEventListener('DOMContentLoaded',()=>setTimeout(init,INIT_DELAY)) : setTimeout(init,INIT_DELAY);
      debugLog('AI Studio Sidebar script injected');
    })();
  }

  /*──────────────────────────────────
    2. RTL Fixes (Script 2)
  ──────────────────────────────────*/
  if (settings.rtl) {
    (function () {
      'use strict';
      const fixStyle = `
      .chat-turn-container.render, .chat-turn-container.render *{direction:rtl !important;text-align:right !important;}
      .chat-turn-container.render p, .chat-turn-container.render span, .chat-turn-container.render div{unicode-bidi:isolate !important;}
      .prose .text-token-streaming{direction:rtl !important;text-align:right !important;}
      button[class*="grounding"]{direction:rtl !important;text-align:right !important;unicode-bidi:plaintext !important;}
      button[class*="grounding"] svg{float:left !important;margin-left:0 !important;margin-right:8px !important;}
      .chat-turn-container.render pre, .chat-turn-container.render pre *, .chat-turn-container.render code, .chat-turn-container.render div[class*="code"], .chat-turn-container.render div[class*="code"] *{direction:ltr !important;text-align:left !important;unicode-bidi:plaintext !important;}`;
      (typeof GM_addStyle==='function')?GM_addStyle(fixStyle):(()=>{const s=document.createElement('style');s.textContent=fixStyle;document.head.appendChild(s);})();
    })();
  }

  /*──────────────────────────────────
    3. בועות צבע (Script 3)
  ──────────────────────────────────*/
  if (settings.bubbles) {
    (() => {
      'use strict';
      const css = `
        :root{--cgpt-user-bubble-bg:#F4FFF7;--cgpt-user-bubble-bg-rgb:244,255,247;--cgpt-user-bubble-text:inherit;--cgpt-user-stripe:#A5D6A7;--cgpt-ai-bubble-bg:#E3F2FD;--cgpt-ai-bubble-bg-rgb:227,242,253;--cgpt-ai-bubble-text:inherit;--cgpt-ai-border:#BBDEFB;--cgpt-ai-stripe:#64B5F6}
        @media (prefers-color-scheme:dark){:root{--cgpt-user-bubble-bg:#3A3F47;--cgpt-user-bubble-bg-rgb-dark:58,63,71;--cgpt-user-bubble-text:#E0E0E0;--cgpt-user-stripe:#508D50;--cgpt-ai-bubble-bg:#2C3035;--cgpt-ai-bubble-bg-rgb-dark:44,48,53;--cgpt-ai-bubble-text:#E0E0E0;--cgpt-ai-border:#454A50;--cgpt-ai-stripe:#4A7ABE}}
        .chat-turn-container.render{box-sizing:border-box !important;max-width:100% !important;overflow-wrap:anywhere;margin:8px 0;border-radius:10px;padding:14px 18px !important;position:relative !important;}
        .chat-turn-container.render.user{background:var(--cgpt-user-bubble-bg) !important;color:var(--cgpt-user-bubble-text) !important;box-shadow:inset -4px 0 0 0 var(--cgpt-user-stripe)}
        .chat-turn-container.render.user *{background-color:transparent !important;}
        .chat-turn-container.render:not(.user){background:var(--cgpt-ai-bubble-bg) !important;color:var(--cgpt-ai-bubble-text) !important;border:1px solid var(--cgpt-ai-border) !important;box-shadow:inset 4px 0 0 0 var(--cgpt-ai-stripe)}
        html,body{overflow-x:hidden !important;}
        .chat-turn-container.render .actions.hover-or-edit{position:absolute !important;right:8px !important;top:-28px !important;padding:2px 6px !important;border-radius:6px !important;z-index:20 !important;box-shadow:0 1px 4px rgba(0,0,0,.25) !important;backdrop-filter:saturate(180%) blur(4px) !important;}
        .chat-turn-container.render.user .actions.hover-or-edit{background:rgba(var(--cgpt-user-bubble-bg-rgb),0.85) !important;}
        .chat-turn-container.render:not(.user) .actions.hover-or-edit{background:rgba(var(--cgpt-ai-bubble-bg-rgb),0.85) !important;}
        @media (prefers-color-scheme:dark){.chat-turn-container.render .actions.hover-or-edit{box-shadow:0 1px 4px rgba(0,0,0,.6) !important;}.chat-turn-container.render.user .actions.hover-or-edit{background:rgba(var(--cgpt-user-bubble-bg-rgb-dark),0.8) !important;}.chat-turn-container.render:not(.user) .actions.hover-or-edit{background:rgba(var(--cgpt-ai-bubble-bg-rgb-dark),0.8) !important;}}
      `;
      (typeof GM_addStyle==='function')?GM_addStyle(css):(()=>{const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);})();
    })();
  }

})();
