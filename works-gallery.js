(() => {
  const section = document.getElementById('myworks');
  const gallery = section.querySelector('.video-gallery');
  const grid = gallery.querySelector('.video-grid');
  const template = gallery.querySelector('template');
  const projects = section.querySelector('.works-grid');
  const categories = [...section.querySelectorAll('[data-filter]')];
  const filters = [...gallery.querySelectorAll('[data-type]')];
  const items = [...projects.querySelectorAll('.work-item')];
  const extraItems = items.filter(item => item.classList.contains('hidden'));
  const more = section.querySelector('#showMoreBtn');
  const less = section.querySelector('#showLessBtn');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Display order, asset stem, filter, accessible name, and presence of audible content.
  const catalogue = [
    ['1_UGC_Podcast',  'ugc',   'UGC podcast ad', true],
    ['1_Viral',        'viral', 'Viral reel 1, park bench startup idea', true],
    ['2_UGC_LongForm', 'ugc',   'Long-form UGC product ad', true],
    ['2_Viral',        'viral', 'Viral reel 2, rate my startup idea', true],
    ['3_UGC_Reaction', 'ugc',   'UGC founder reaction ad', false],
    ['3_Viral',        'viral', 'Viral reel 3, do not show this to a founder', false],
    ['4_UGC_B-Roll',   'ugc',   'UGC B-roll ad, a message from a friend', true],
    ['4_Viral',        'viral', 'Viral reel 4, weekend startup idea', false],
  ];
  const previews = new Map();
  let category = 'video';
  let videoType = 'all';
  let visibleObserver;

  function refreshControls(preview) {
    const { card, video, sound, playback, name, intent, blocked } = preview;
    const playing = !video.paused;
    const action = playing ? 'Pause' : 'Play';
    card.classList.toggle('is-playing', playing);
    card.classList.toggle('needs-play', !playing && (blocked || intent === 'pause' || reducedMotion.matches));
    playback.title = action + ' preview';
    playback.setAttribute('aria-label', action + ' ' + name);
    if (sound) {
      sound.title = video.muted ? 'Turn sound on' : 'Mute';
      sound.setAttribute('aria-pressed', String(!video.muted));
    }
  }

  function prepare(preview) {
    const { video, stem, intent } = preview;
    if (!video.hasAttribute('poster')) video.poster = 'img/video-posters/' + stem + '.webp';
    if (!video.hasAttribute('src') && (!reducedMotion.matches || intent === 'play')) {
      video.preload = 'metadata';
      video.src = stem + '.mp4';
    }
  }

  function pause(preview) {
    preview.pending = null;
    preview.video.muted = true;
    preview.video.pause();
    refreshControls(preview);
  }

  function start(preview) {
    const { video } = preview;
    if (!preview.visible || document.hidden || !preview.active ||
        preview.intent === 'pause' || preview.blocked ||
        (reducedMotion.matches && preview.intent !== 'play')) return;
    prepare(preview);
    if (!video.paused || preview.pending) return;
    const request = video.play();
    preview.pending = request;
    request.catch(() => {
      // A later pause or play owns the card if the view changed during loading.
      if (preview.pending !== request) return;
      preview.blocked = true;
      pause(preview);
    }).finally(() => {
      if (preview.pending === request) preview.pending = null;
    });
  }

  function togglePlayback(preview) {
    if (!preview.video.paused) {
      preview.intent = 'pause';
      pause(preview);
      return;
    }
    preview.intent = 'play';
    preview.blocked = false;
    preview.visible = true;
    if (preview.video.error) preview.video.load();
    start(preview);
  }

  function toggleSound(preview) {
    const { video } = preview;
    if (video.muted) {
      for (const other of previews.values()) {
        if (!other.video.muted) {
          other.video.muted = true;
          refreshControls(other);
        }
      }
      video.muted = false;
      // An explicitly paused or reduced-motion preview waits for its Play button.
      if (preview.intent !== 'pause' && (!reducedMotion.matches || preview.intent === 'play')) {
        preview.visible = true;
        preview.blocked = false;
        start(preview);
      }
    } else {
      video.muted = true;
    }
    refreshControls(preview);
  }

  for (const [stem, type, name, hasAudio] of catalogue) {
    const card = template.content.firstElementChild.cloneNode(true);
    const video = card.querySelector('video');
    const sound = card.querySelector('.sound-control');
    const playback = card.querySelector('.playback-control');
    const preview = { card, video, sound: hasAudio ? sound : null, playback, stem, type, name,
      intent: 'auto', active: false, visible: false, blocked: false, pending: null };
    video.setAttribute('aria-label', name);
    video.muted = true;
    try { video.volume = 0.5; } catch { /* Some devices control volume in hardware. */ }
    if (hasAudio) {
      sound.setAttribute('aria-label', 'Sound for ' + name);
      sound.addEventListener('click', () => toggleSound(preview));
    } else {
      sound.remove();
    }
    video.addEventListener('click', () => hasAudio ? toggleSound(preview) : togglePlayback(preview));
    playback.addEventListener('click', () => togglePlayback(preview));
    for (const event of ['play', 'pause', 'volumechange']) {
      video.addEventListener(event, () => refreshControls(preview));
    }
    video.addEventListener('error', () => {
      preview.blocked = true;
      pause(preview);
    });
    card.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      card.classList.add('touch-controls');
      clearTimeout(preview.touchTimer);
      preview.touchTimer = setTimeout(() => card.classList.remove('touch-controls'), 3500);
    });
    refreshControls(preview);
    previews.set(card, preview);
    grid.append(card);
  }

  const nearbyObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const preview = previews.get(entry.target);
      if (entry.isIntersecting && preview.active && !document.hidden) prepare(preview);
    }
  }, { rootMargin: '300px 0px' });

  // Exclude the fixed navigation and use separate entry/exit thresholds to avoid flicker.
  const navigation = document.querySelector('nav');
  function observeViewport() {
    visibleObserver?.disconnect();
    visibleObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const preview = previews.get(entry.target);
        if (!preview.active || document.hidden) continue;
        if (entry.intersectionRatio >= 0.4) {
          preview.visible = true;
          start(preview);
        } else if (entry.intersectionRatio < 0.12) {
          preview.visible = false;
          pause(preview);
        }
      }
    }, { rootMargin: '-' + Math.ceil(navigation.getBoundingClientRect().height) + 'px 0px 0px',
      threshold: [0, 0.12, 0.4] });
    for (const preview of previews.values()) {
      if (preview.active) visibleObserver.observe(preview.card);
    }
  }
  observeViewport();
  new ResizeObserver(observeViewport).observe(navigation);

  function updateVideos() {
    for (const preview of previews.values()) {
      const shown = category === 'video' && (videoType === 'all' || videoType === preview.type);
      preview.card.hidden = !shown;
      const active = shown && !document.hidden;
      if (preview.active === active) continue;
      preview.active = active;
      if (active) {
        nearbyObserver.observe(preview.card);
        visibleObserver.observe(preview.card);
      } else {
        nearbyObserver.unobserve(preview.card);
        visibleObserver.unobserve(preview.card);
        preview.visible = false;
        pause(preview);
      }
    }
  }

  function selectCategory(value) {
    category = value;
    categories.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === value)));
    gallery.hidden = value !== 'video';
    projects.hidden = value === 'video';
    items.forEach(item => item.classList.toggle('filter-hide', item.dataset.category !== value));
    updateVideos();
    window.AOS?.refresh();
  }
  categories.forEach(button => button.addEventListener('click', () => selectCategory(button.dataset.filter)));
  filters.forEach(button => button.addEventListener('click', () => {
    videoType = button.dataset.type;
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    updateVideos();
    window.AOS?.refresh();
  }));

  function expandProjects(expanded) {
    extraItems.forEach((item, index) => {
      item.classList.toggle('hidden', !expanded);
      if (expanded) item.dataset.aosDelay = index * 100;
    });
    more.hidden = expanded;
    less.hidden = !expanded;
    window.AOS?.refresh();
    (expanded ? less : more).focus({ preventScroll: true });
  }
  more.addEventListener('click', () => expandProjects(true));
  less.addEventListener('click', () => expandProjects(false));

  document.addEventListener('visibilitychange', updateVideos);
  reducedMotion.addEventListener('change', () => {
    for (const preview of previews.values()) {
      if (preview.intent !== 'pause') preview.intent = 'auto';
      if (reducedMotion.matches) pause(preview);
      else start(preview);
      refreshControls(preview);
    }
  });

  function selectLinkedCategory() {
    const [anchor, query] = location.hash.split('?');
    if (anchor !== '#myworks') return;
    const value = new URLSearchParams(query).get('filter');
    if (categories.some(button => button.dataset.filter === value)) selectCategory(value);
    if (query) section.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
  selectCategory(category);
  selectLinkedCategory();
  window.addEventListener('hashchange', selectLinkedCategory);
})();
