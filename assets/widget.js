/* Noor — "Never Miss a Customer" demo chat engine (Habib Orchards personalized edition).
   Built for ONE client: Habib Orchards, Rahim Yar Khan — details baked in from
   DETAILS.md (verified from their Facebook Page, 2026-11-09). NOT re-brandable
   via query params; this is a personalized build, not the fleet template.
   100% client-side. No network calls, no tracking. Works from file:// .
   Leads persist in the browser only (localStorage key "nmc_habib_leads").
   HONESTY (hard rule): Noor NEVER invents plot sizes, prices, plan terms or
   availability — none are published by the business. Prices and plan options
   are always "confirmed by the sales team".
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send(). */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';
  var LEAD_KEY = 'nmc_habib_leads';

  /* ---------- business profile (baked in — see DETAILS.md) ---------- */
  var BIZ = {
    name:    'Habib Orchards',
    tagline: 'Where the Future Takes Shape',
    city:    'Rahim Yar Khan',
    address: '1.5 KM KFUEIT, Abu Dhabi Palace Road, Rahim Yar Khan, Pakistan',
    phone:   '+92 303 3954444',
    email:   'habiborchards@gmail.com',
    host:    'Noor',
    refPrefix: 'HO'
  };

  /* ---------- leads (localStorage only) ---------- */
  /* Sample leads: seeded ONCE (only when nothing is stored yet) so the
     prospect can see the inbox format. All three are explicitly marked
     "(sample)" and use obvious Pakistani test-pattern numbers. Clearing the
     inbox stores '[]', so seeds never come back. */
  function seedLeads() {
    var now = Date.now();
    return [
      { name: 'Ahmed Raza (sample)', phone: '0300 1234567', topic: 'Plot price inquiry',
        details: 'Wants the current plot prices before the 15 Nov revision',
        source: 'after-hours 11:42 PM', at: new Date(now - 3 * 3600 * 1000).toISOString(), biz: BIZ.name },
      { name: 'Fatima Noor (sample)', phone: '0321 7654321', topic: 'Payment plan question',
        details: 'Asked how the payment plan works and what the team needs from her',
        source: 'chat inquiry', at: new Date(now - 26 * 3600 * 1000).toISOString(), biz: BIZ.name },
      { name: 'Bilal Khan (sample)', phone: '0345 7654321', topic: 'Site visit request',
        details: 'Wants to visit the society this weekend with his family',
        source: 'site-visit booking', at: new Date(now - 50 * 3600 * 1000).toISOString(), biz: BIZ.name }
    ];
  }
  var leads = [];
  try {
    var raw = localStorage.getItem(LEAD_KEY);
    if (raw === null) { leads = seedLeads(); localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); }
    else { leads = JSON.parse(raw || '[]'); }
  } catch (e) { leads = seedLeads(); }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
    renderInbox(); /* keep the prospect-visible inbox panel live */
  }

  /* ---------- captured-leads inbox preview (prospect-visible panel) ---------- */
  var inboxEls = null;
  function inboxDom() {
    if (!inboxEls) {
      var panel = document.getElementById('inbox-panel');
      var list = document.getElementById('inbox-list');
      var toggle = document.getElementById('inbox-toggle');
      var count = document.getElementById('inbox-count');
      if (!panel || !list || !toggle) return null;
      inboxEls = { panel: panel, list: list, toggle: toggle, count: count };
    }
    return inboxEls;
  }
  function fmtLeadTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || '';
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return iso || ''; }
  }
  function renderInbox() {
    var dom = inboxDom();
    if (!dom) return;
    if (dom.count) dom.count.textContent = String(leads.length);
    if (!leads.length) {
      dom.list.innerHTML = '<div class="inbox-empty"><b>No leads yet.</b><br>' +
        'Try the &#127769; 11:42 PM after-hours flow in the chat &mdash; the captured lead will appear right here.</div>';
      return;
    }
    dom.list.innerHTML = leads.slice().reverse().map(function (l) {
      var when = l.at
        ? '<time datetime="' + escapeHtml(l.at) + '">' + escapeHtml(fmtLeadTime(l.at)) + '</time>'
        : '&mdash;';
      var detail = (l.details && l.details !== '—' && l.details !== '-')
        ? '<div class="lead-detail">&ldquo;' + escapeHtml(l.details) + '&rdquo;</div>'
        : '';
      return '<div class="lead-row">' +
        '<span class="lead-name">' + escapeHtml(l.name || '—') + '</span>' +
        '<span class="lead-tag">' + escapeHtml(l.topic || 'Lead') + '</span>' +
        '<span class="lead-phone">' + escapeHtml(l.phone || '—') + '</span>' +
        '<span class="lead-src">' + escapeHtml(l.source || '') + '</span>' +
        '<div class="lead-when">Captured ' + when + '</div>' +
        detail +
        '</div>';
    }).join('');
  }

  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review | quiz
    step: 0,
    booking: {},
    ah: {},
    quiz: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  /* Chip labels carry HTML entities (e.g. '&#127769; After-hours demo'). When a
     chip's label becomes the visitor's sent bubble it must be DECODED first —
     otherwise the bubble shows the raw entity text. (Fleet cosmetic bug, fixed
     here: route on the raw text, display the decoded text.) */
  function decodeEntities(s) {
    var ta = document.createElement('textarea');
    ta.innerHTML = s;
    return ta.value;
  }

  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(decodeEntities(text))));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* tap-to-call link for chat flows — the business's real number, display escaped. */
  function callLinkHtml() {
    var href = 'tel:' + String(BIZ.phone).replace(/[^+\d]/g, '');
    return '<a class="call-link" href="' + escapeHtml(href) + '">&#128222; Call ' + escapeHtml(BIZ.phone) + '</a>';
  }

  /* word-start keyword match (proven fleet standard, 2026-10-03): "foreclosure"
     must not trip a "close" keyword, "recall" must not trip "call". */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) { return new RegExp('(^|[^a-z])' + escRe(w)).test(t); });
  }

  function digitsOf(s) { return String(s).replace(/\D/g, ''); }

  /* ---------- intent answers ---------- */
  function servicesHtml() {
    return 'Here&rsquo;s what Habib Orchards offers. &#127795;<br><br>' +
      '<b>Residential plots</b> &mdash; premium plots in a developed housing society, Abu Dhabi Palace Road, Rahim Yar Khan<br>' +
      '<b>Payment plans</b> &mdash; spread the cost; the sales team confirms the current plan options with you<br>' +
      '<b>Site visits</b> &mdash; book a visit in the chat and walk the society yourself<br>' +
      '<b>After-hours answers</b> &mdash; I reply instantly at any hour, so no inquiry waits till morning<br><br>' +
      'Which one sounds like you?';
  }

  function pricesHtml() {
    return 'Straight answer: Habib Orchards doesn&rsquo;t publish plot prices online &mdash; the <b>sales team confirms the current prices personally</b>, so nobody is ever quoted a wrong figure. &#128176;<br><br>' +
      'One thing worth knowing: <b>prices revise on 15 November 2026</b>. If you&rsquo;re considering a plot, ask for the <b>current</b> prices now, before the revision.<br><br>' +
      callLinkHtml() + ' &mdash; or tap <b>After-hours demo</b> below, leave your number, and the team will send the current prices first thing in the morning.';
  }

  function planHtml() {
    return 'Yes &mdash; <b>payment plans are available</b> on Habib Orchards residential plots, so you don&rsquo;t have to pay everything at once. &#128179;<br><br>' +
      'The exact current plan options are confirmed by the sales team &mdash; they move with the price list, and prices revise on <b>15 November 2026</b> &mdash; so I won&rsquo;t invent figures here.<br><br>' +
      callLinkHtml() + ' &mdash; or book a site visit and go through the plan in person.';
  }

  function hoursHtml() {
    return '<b>When the team replies:</b><br>The sales team replies during the day.<br><br>' +
      'But here&rsquo;s the thing &mdash; <b>I&rsquo;m here 24/7</b>. Plot questions, current-price requests and site-visit bookings never have to wait for morning: I answer what I can and capture the rest for the team. Want to book a site visit?';
  }

  function defaultChips() {
    return [
      { label: '&#127795; Our plots &amp; plans', value: 'services' },
      { label: '&#128197; Book a site visit', value: 'book a site visit' },
      { label: '&#127769; After-hours demo', value: 'after hours' },
      { label: '&#11088; Rate your experience', value: 'rate experience' },
      { label: '&#129512; 60-sec plot quiz', value: 'plot quiz' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Hi there! I\'m <b>' + escapeHtml(BIZ.host) + '</b>, ' + escapeHtml(BIZ.name) + '\'s coordinator. &#127795;<br><br>' +
      'Ask me about <b>plots</b>, <b>current prices</b> or <b>payment plans</b> &mdash; or I can <b>book your site visit</b> right now. What can I help with?',
      defaultChips()
    );
  }

  /* ---------- site-visit booking flow ---------- */
  var INTERESTS = ['Buy a plot', 'Payment plan question', 'Site visit', 'Just exploring'];

  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Love it &mdash; let&rsquo;s set it up. <b>What brings you in?</b>',
      INTERESTS.map(function (r) { return { label: r }; }));
  }

  function bookingStep(text) {
    var t = text.toLowerCase().trim();
    if (S.step === 0) {
      var interest = 'Buy a plot';
      if (has(t, 'payment', 'plan', 'installment', 'instalment')) interest = 'Payment plan question';
      else if (has(t, 'visit', 'tour', 'see')) interest = 'Site visit';
      else if (has(t, 'explor', 'brows', 'just')) interest = 'Just exploring';
      else if (has(t, 'buy', 'plot', 'purchase')) interest = 'Buy a plot';
      S.booking.interest = interest; S.step = 1;
      return say('<b>' + escapeHtml(interest) + '</b> &mdash; got it. <b>What&rsquo;s your name?</b>');
    }
    if (S.step === 1) {
      var name = text.trim();
      if (name.length < 2 || name.length > 40) {
        return say('And your <b>name</b> for the booking?');
      }
      S.booking.name = name; S.step = 2;
      return say('Thanks, ' + escapeHtml(cap(name.split(' ')[0])) +
        '! Want a <b>WhatsApp reminder</b> before your visit? Drop your number &mdash; or skip it.',
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      var digits = digitsOf(t);
      if (t !== 'skip' && digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(or tap Skip)</i>',
          [{ label: 'Skip', value: 'skip' }]);
      }
      if (t !== 'skip') S.booking.phone = text.trim();
      S.step = 3;
      return say('<b>Which day</b> works best for you?',
        [{ label: 'Tomorrow' }, { label: 'Friday' }, { label: 'Saturday' }, { label: 'Sunday' }]);
    }
    if (S.step === 3) {
      var day = 'Saturday';
      if (has(t, 'tomorrow', 'today')) day = 'Tomorrow';
      else {
        var dm = t.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
        if (dm) day = cap(dm[0]);
      }
      S.booking.day = day; S.step = 4;
      return say('<b>' + escapeHtml(day) + '</b> it is. <b>What time</b> suits you?',
        [{ label: '10:00 AM' }, { label: '12:30 PM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
    }
    if (S.step === 4) {
      var tm = t.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/);
      if (!tm) {
        return say('What <b>time</b> should I hold for you? <i>(e.g. 3:00 PM)</i>',
          [{ label: '10:00 AM' }, { label: '3:00 PM' }, { label: '5:30 PM' }]);
      }
      var time = text.trim();
      if (!/am|pm/i.test(time)) time += ' PM';
      var ref = makeRef();
      S.booking.ref = ref;
      saveLead({
        name: S.booking.name,
        phone: S.booking.phone || '—',
        topic: 'Site visit booking',
        details: S.booking.interest + ' · ' + S.booking.day + ' at ' + time + ' · Ref ' + ref,
        source: 'site-visit booking'
      });
      var line = '<b>&#9989; You\'re booked!</b><br><br><b>' + escapeHtml(S.booking.interest) + '</b> &middot; ' +
        escapeHtml(S.booking.day) + ' at <b>' + escapeHtml(time) + '</b><br>Visitor: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reference: <span class="ref">' + ref + '</span><br><br>';
      if (S.booking.phone) line += 'We&rsquo;ll confirm on WhatsApp before your visit. ';
      line += 'The meeting point is the Habib Orchards site office, <b>' + escapeHtml(BIZ.address) + '</b>. Anything else I can help with?<br><br>' +
        'Prefer to talk it through? ' + callLinkHtml();
      S.mode = 'idle'; S.step = 0;
      return say(line, [{ label: '&#127795; Our plots &amp; plans', value: 'services' }, { label: '&#128336; Team &amp; chat hours', value: 'hours' }]);
    }
  }

  /* ---------- after-hours lead capture (the money flow) ---------- */
  var AH_TOPICS = {
    plot:  { label: 'Buy a plot',       prompt: 'What are you looking for? <i>(a plot for your own home, or an investment &mdash; anything helps)</i>' },
    plan:  { label: 'Payment plan',     prompt: 'What would you like to know about the payment plan? <i>(the sales team will go through the current options with you)</i>' },
    visit: { label: 'Site visit',       prompt: 'When would you like to visit? <i>(a day and time that suits you)</i>' }
  };

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; the sales team is asleep right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', ' + escapeHtml(BIZ.name) + '\'s coordinator, and I\'m still here. <b>No inquiry waits till morning.</b>'
      },
      {
        html: 'What can I capture for the morning team?',
        chips: [
          { label: '&#128269; Buy a plot', value: 'plot' },
          { label: '&#128179; Payment plan', value: 'plan' },
          { label: '&#128205; Site visit', value: 'visit' }
        ]
      }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      var key = 'plot';
      var tl = t.toLowerCase();
      if (has(tl, 'plan', 'payment', 'installment', 'instalment')) key = 'plan';
      else if (has(tl, 'visit')) key = 'visit';
      else if (has(tl, 'plot', 'buy')) key = 'plot';
      S.ah.topic = AH_TOPICS[key].label; S.ah.key = key; S.step = 1;
      return say('<b>' + escapeHtml(S.ah.topic) + '</b> &mdash; noted. What <b>name</b> should I save this under?');
    }
    if (S.step === 1) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 2;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> for the morning team to reach you?');
    }
    if (S.step === 2) {
      var digits = digitsOf(t);
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 3;
      return say('Got it. ' + AH_TOPICS[S.ah.key].prompt,
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 3) {
      S.ah.details = (t.toLowerCase() === 'skip') ? '—' : t;
      saveLead({ name: S.ah.name, phone: S.ah.phone, topic: S.ah.topic, details: S.ah.details, source: 'after-hours 11:42 PM' });
      S.mode = 'idle'; S.step = 0;
      return sayMany([
        { html: '<b>&#9989; Saved!</b> The morning team will follow up <b>first thing</b> &mdash; with the current prices and plan options, before the 15 November revision. No need to wonder if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Interest', S.ah.topic],
            ['Details', S.ah.details],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That&rsquo;s the whole point &mdash; <b>every late-night inquiry becomes a morning follow-up</b>, not a lead lost to the project down the road. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  /* ---------- review routing ---------- */
  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We\'d love to hear it &mdash; <b>how was your experience?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('⭐'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('That made our whole team&rsquo;s day! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely helps a local project like ours grow.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '⭐ Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that&rsquo;s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    saveLead({ name: '(review feedback)', phone: '—', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our sales team will personally follow up on this.<br><br>' +
      'We&rsquo;d love a second chance to earn those last stars. Can I book you a site visit?',
      [{ label: '&#128197; Book a site visit', value: 'book a site visit' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- 60-second plot quiz (plot-buyer qualification lead capture) ----------
     HONESTY (hard rule): Noor NEVER invents plot sizes, prices or plan terms —
     the quiz promises the sales team will share CURRENT prices + plan options
     that fit the visitor's answers, nothing more. */
  var QUIZ_PURPOSES = ['For my own home', 'Investment', 'For my family', 'Just exploring'];
  var QUIZ_TIMELINES = ['ASAP', '1–3 months', '3–6 months', 'Just exploring'];
  var QUIZ_PAYMENTS = ['Full payment', 'Payment plan', 'Not sure yet'];

  function canonChoice(t, options) {
    var tl = t.toLowerCase();
    for (var i = 0; i < options.length; i++) {
      if (tl === options[i].toLowerCase()) return options[i];
    }
    return t.trim().slice(0, 60); /* free text accepted, length-capped */
  }

  function startQuiz() {
    S.mode = 'quiz'; S.step = 0; S.quiz = {};
    return say('<b>&#129512; The 60-second plot quiz!</b><br><br>' +
      'Three quick questions and the sales team will share the <b>current prices and payment-plan options that fit you</b>. No spam, no invented figures.<br><br>' +
      '<b>First: what&rsquo;s the plot for?</b>',
      QUIZ_PURPOSES.map(function (b) { return { label: b }; }));
  }

  function quizStep(text) {
    var t = text.trim();
    var tl = t.toLowerCase();
    if (S.step === 0) {
      S.quiz.purpose = canonChoice(t, QUIZ_PURPOSES); S.step = 1;
      return say('Got it &mdash; <b>' + escapeHtml(S.quiz.purpose) + '</b> it is. &#129512;<br><br><b>And your timeline?</b>',
        QUIZ_TIMELINES.map(function (x) { return { label: x }; }));
    }
    if (S.step === 1) {
      S.quiz.timeline = canonChoice(t, QUIZ_TIMELINES); S.step = 2;
      return say('Noted! Last one &mdash; <b>how would you like to pay?</b>',
        QUIZ_PAYMENTS.map(function (x) { return { label: x }; }));
    }
    if (S.step === 2) {
      S.quiz.payment = canonChoice(t, QUIZ_PAYMENTS); S.step = 3;
      return say('Perfect. <b>What&rsquo;s your name</b> for the plot list?');
    }
    if (S.step === 3) {
      if (t.length < 2 || t.length > 40) {
        return say('And your <b>name</b> for the plot list?');
      }
      S.quiz.name = t; S.step = 4;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> to send your options to?');
    }
    if (S.step === 4) {
      var digits = digitsOf(tl);
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.quiz.phone = t; S.step = 5;
      return finishQuiz();
    }
  }

  function finishQuiz() {
    var q = S.quiz;
    saveLead({
      name: q.name,
      phone: q.phone,
      topic: 'Plot quiz — qualified lead',
      details: 'Purpose ' + q.purpose + ' · Timeline ' + q.timeline + ' · Payment ' + q.payment,
      source: 'plot quiz'
    });
    S.mode = 'idle'; S.step = 0; S.quiz = {};
    return sayMany([
      { html: '<b>&#9989; Quiz complete!</b> &#129512;<br><br>Here&rsquo;s your plot profile:' },
      {
        dash: [
          ['Purpose', q.purpose],
          ['Timeline', q.timeline],
          ['Payment', q.payment]
        ]
      },
      {
        html: 'The <b>sales team</b> will share the <b>current prices + payment-plan options</b> that fit &mdash; straight to your phone. Remember, prices revise on <b>15 November 2026</b>, so they&rsquo;ll confirm the current ones with you.<br><br>Want to see the society in person? We can <b>book your site visit</b> right now.',
        chips: defaultChips()
      }
    ]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'quiz') return quizStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    /* plot quiz first: its value contains 'plot'/'quiz', which the buy and
       services branches below would otherwise swallow. */
    if (has(t, 'plot quiz', 'quiz')) return startQuiz();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    /* review BEFORE the price branch, but with narrow keywords only: bare
       'rate' means plot rates/prices in this niche, never the review flow. */
    if (has(t, 'rate experience', 'rate your', 'review', 'stars', 'feedback', 'rating')) return startReview();
    if (has(t, 'book', 'site visit', 'visit', 'tour', 'appoint', 'schedul', 'slot')) return startBooking();
    if (has(t, 'price', 'cost', 'how much', 'rate', 'charges', 'fee', 'per marla', 'total price')) return say(pricesHtml(),
      [{ label: '&#127769; After-hours demo', value: 'after hours' }, { label: '&#128197; Book a site visit', value: 'book a site visit' }]);
    if (has(t, 'payment plan', 'installment', 'instalment', 'down payment', 'loan', 'financ', 'plan')) return say(planHtml(),
      [{ label: '&#128197; Book a site visit', value: 'book a site visit' }, { label: '&#127769; After-hours demo', value: 'after hours' }]);
    if (has(t, 'sell')) return say('Habib Orchards sells plots in its own society &mdash; for <b>buying, payment plans and site visits</b> I&rsquo;m your fastest route. &#127795;<br><br>If your question is about an existing booking of yours, the sales team can help directly: ' + callLinkHtml(),
      [{ label: '&#127795; Our plots &amp; plans', value: 'services' }]);
    if (has(t, 'buy', 'plot', 'plots', 'looking for', 'purchase')) return say('Let&rsquo;s find your plot. &#128269; Tell me roughly what you&rsquo;re after &mdash; <b>a plot for your own home, or an investment</b> &mdash; and whether you&rsquo;d like a <b>payment plan</b>. The sales team will confirm the current prices with you.<br><br>Or skip ahead and <b>book a site visit</b> &mdash; see the society yourself.',
      [{ label: '&#128197; Book a site visit', value: 'book a site visit' }, { label: '&#129512; 60-sec plot quiz', value: 'plot quiz' }]);
    if (has(t, 'service', 'offer', 'do you do', 'what do you', 'help with')) return say(servicesHtml(), [{ label: '&#128197; Book a site visit', value: 'book a site visit' }]);
    if (has(t, 'hour', 'open', 'when do you', 'what time', 'timing')) return say(hoursHtml(), [{ label: '&#128197; Book a site visit', value: 'book a site visit' }]);
    if (has(t, 'where', 'address', 'location', 'direction', 'find you', 'office', 'map', 'reach')) {
      return say('Find us at <b>' + escapeHtml(BIZ.address) + '</b> &mdash; on Abu Dhabi Palace Road, near KFUEIT. &#128205;<br><br>' + callLinkHtml() + ' &mdash; we&rsquo;re happy to help anytime.',
        [{ label: '&#128197; Book a site visit', value: 'book a site visit' }]);
    }
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone', 'speak to', 'agent', 'contact', 'whatsapp', 'email')) return say('Of course &mdash; ' + callLinkHtml() + ' &mdash; the same number is on <b>WhatsApp</b>, and the sales team picks up during the day. After hours, I capture everything here so nothing is lost. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime! That&rsquo;s what I&rsquo;m here for. &#127795;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later')) { S.mode = 'idle'; return say('See you soon at ' + escapeHtml(BIZ.name) + ' &mdash; <i>where the future takes shape!</i> &#127795;'); }
    if (/\b(hi+|hello|hey+|hola|yo)\b/.test(t) || has(t, 'good morning', 'good evening')) return say('Hey hey! &#128075; What can I do for you &mdash; <b>plots</b>, <b>current prices</b>, the <b>payment plan</b>, or shall I <b>book your site visit</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I&rsquo;m here whenever you need me. &#127795;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the sales team confirm that for you. &#128172;<br><br>Meanwhile, can I help with <b>current plot prices</b>, the <b>payment plan</b>, or a <b>site visit</b>?',
      [{ label: '&#128176; Current plot prices', value: 'plot prices' }, { label: '&#128179; Payment plan', value: 'payment plan' }, { label: '&#128197; Book a site visit', value: 'book a site visit' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function clearLeads() {
    leads = [];
    try { localStorage.setItem(LEAD_KEY, '[]'); } catch (e) {}
    renderInbox();
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');

    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* site CTAs jump into flows */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });
    document.querySelectorAll('[data-action="prices"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true);
        setTimeout(function () { if (S.mode === 'idle') userSays('plot prices', true); }, FAST ? 50 : 600);
      });
    });
    document.querySelectorAll('[data-action="plan"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true);
        setTimeout(function () { if (S.mode === 'idle') userSays('payment plan', true); }, FAST ? 50 : 600);
      });
    });

    /* captured-leads inbox toggle (prospect-visible "Saved to your dashboard") */
    var idom = inboxDom();
    if (idom) {
      renderInbox();
      idom.toggle.addEventListener('click', function () {
        var isHidden = idom.panel.hasAttribute('hidden');
        if (isHidden) { idom.panel.removeAttribute('hidden'); renderInbox(); }
        else { idom.panel.setAttribute('hidden', ''); }
        idom.toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      saveLead: saveLead,
      renderInbox: renderInbox,
      getLeads: function () { return leads; },
      clearLeads: clearLeads
    };
    window.__clearLeads = clearLeads;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
