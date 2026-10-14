const gallery = document.querySelector('#gallery');
const filters = document.querySelector('#filters');
const albumGrid = document.querySelector('#album-grid');
const loadMore = document.querySelector('#load-more');
const count = document.querySelector('#works-count');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxCaption = document.querySelector('#lightbox-caption');
const lightboxCounter = document.querySelector('#lightbox-counter');
const PAGE_SIZE = 20;

let albums = [];
let activeAlbum = 'all';
let visibleCount = PAGE_SIZE;
let activePhotos = [];
let activeIndex = 0;

const allPhotos = () => albums.flatMap(album => album.works.map(photo => ({...photo, albumId: album.id, albumTitle: album.title})));
const coverPhotos = (album, indexes) => {
  const chosen = (indexes || []).map(index => album.works[index]).filter(Boolean);
  return (chosen.length ? chosen : album.works.slice(0, 3)).slice(0, 3);
};

const isPortrait = photo => photo.height >= photo.width;

// Portrait-heavy albums use up to three portrait photos; landscape-heavy albums
// use one landscape photo. Prefer owner-selected coverIndexes, then fill from the
// matching orientation. The frame ratio follows the photos so nothing is cropped.
function coverPlan(album) {
  const works = album.works || [];
  if (!works.length) return {variant: 'single', photos: [], ratio: '3 / 2'};
  const portraits = works.filter(isPortrait);
  const landscapes = works.filter(photo => !isPortrait(photo));
  const selected = coverPhotos(album, album.coverIndexes);

  if (portraits.length >= landscapes.length) {
    const photos = selected.filter(isPortrait);
    for (const photo of portraits) {
      if (photos.length >= 3) break;
      if (!photos.includes(photo)) photos.push(photo);
    }
    const shown = (photos.length ? photos : selected).slice(0, 3);
    if (shown.length === 1) {
      return {variant: 'single', photos: shown, ratio: `${shown[0].width} / ${shown[0].height}`};
    }
    const ratio = shown.reduce((sum, photo) => sum + photo.width / photo.height, 0).toFixed(3);
    return {variant: shown.length === 2 ? 'duo' : 'trio', photos: shown, ratio: `${ratio} / 1`};
  }

  const photo = selected.find(item => !isPortrait(item)) || landscapes[0] || works[0];
  return {variant: 'single', photos: [photo], ratio: `${photo.width} / ${photo.height}`};
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function formatShotDate(value) {
  return String(value || '').replace(/-/g, '.');
}

function gearListHTML(label, items) {
  const safeItems = (items || []).filter(Boolean).map(item => `<span class="gear-item">${escapeHTML(item)}</span>`);
  if (!safeItems.length) return '';
  return `<span class="gear-label">${escapeHTML(label)}</span>${safeItems.join('<span class="gear-sep">、</span>')}`;
}

function albumInfoHTML(album) {
  const lines = [];
  if (album?.location) lines.push(`<span class="info-line">摄于 ${escapeHTML(album.location)}</span>`);
  if (album?.gear?.length) lines.push(`<span class="info-line">${gearListHTML('使用器材为', album.gear)}</span>`);
  if (album?.shotAt) lines.push(`<span class="info-line">拍摄时间 ${escapeHTML(formatShotDate(album.shotAt))}</span>`);
  return lines.join('');
}

function renderAuthor(site) {
  const author = site.author || {};
  const name = (author.name || '').trim();
  const bio = (author.bio || '').trim();
  const gear = (author.gear || []).filter(Boolean);
  document.querySelector('#author-name').textContent = name || '作者姓名待填写';
  const bioNode = document.querySelector('#author-bio');
  if (!bio && !gear.length) {
    bioNode.textContent = '在 site-content.json 中写下你的摄影经历、拍摄风格或想分享的话。';
    return;
  }
  const lines = [];
  if (bio) lines.push(`<span class="bio-line">${escapeHTML(bio)}</span>`);
  if (gear.length) lines.push(`<span class="bio-line">${gearListHTML(author.gearLabel || '使用器材为', gear)}</span>`);
  bioNode.innerHTML = lines.join('');
}

function renderHero(site) {
  const picks = Array.isArray(site.heroPhotos) ? site.heroPhotos : [];
  let photos = picks.map(pick => {
    const album = albums.find(item => item.id === pick.albumId);
    if (!album) return null;
    if (pick.alt) return album.works.find(work => work.alt === pick.alt) || album.works[0];
    const index = Number(pick.photo);
    return Number.isFinite(index) ? album.works[index - 1] : album.works[0];
  }).filter(Boolean);
  if (!photos.length) {
    const legacy = albums.find(item => item.id === site.author?.heroAlbumId) || albums[0];
    photos = legacy ? coverPhotos(legacy, site.author?.heroCoverIndexes) : [];
  }
  if (!photos.length) return;
  photos = photos.slice(0, 3);
  if (photos.length === 3) {
    // Tallest image takes the full-height left panel, the two wider ones stack on the right.
    photos = [...photos].sort((a, b) => (a.width / a.height) - (b.width / b.height));
  }
  document.querySelector('#hero-gallery').replaceChildren(...photos.map((photo, index) => {
    const figure = document.createElement('figure');
    figure.className = 'hero-photo';
    figure.style.setProperty('--photo', `url("${encodeURI(photo.src)}")`);
    figure.innerHTML = `<img src="${photo.src}" alt="精选摄影作品 ${index + 1}" fetchpriority="${index === 0 ? 'high' : 'auto'}"><span>${String(index + 1).padStart(2, '0')}</span>`;
    return figure;
  }));
}

function renderAlbumCards() {
  document.querySelector('#album-count').textContent = String(albums.length).padStart(2, '0');
  albumGrid.replaceChildren(...albums.map((album, albumIndex) => {
    const card = document.createElement('button');
    card.className = 'album-card';
    card.type = 'button';
    card.setAttribute('aria-label', `打开相册：${album.title}`);
    const plan = coverPlan(album);
    const covers = plan.photos.map((photo, photoIndex) =>
      `<img src="${photo.src}" alt="${escapeHTML(album.title)} 封面 ${photoIndex + 1}" loading="lazy" decoding="async">`
    ).join('');
    card.innerHTML = `<span class="album-covers album-covers--${plan.variant}" style="aspect-ratio:${plan.ratio}">${covers}</span><span class="album-card-copy"><span class="album-card-index">ALBUM ${String(albumIndex + 1).padStart(2, '0')} · ${String(album.count).padStart(2, '0')} PHOTOS</span><strong>${escapeHTML(album.title)}</strong><span class="album-card-description">${albumInfoHTML(album) || '相册简介待填写。'}</span></span>`;
    card.addEventListener('click', () => selectAlbum(album.id, true));
    return card;
  }));
}

function renderFilters() {
  const total = albums.reduce((sum, album) => sum + album.count, 0);
  const options = [{id: 'all', title: '全部作品', count: total}, ...albums.map(({id, title, count}) => ({id, title, count}))];
  filters.replaceChildren(...options.map(option => {
    const button = document.createElement('button');
    button.className = `filter-button${activeAlbum === option.id ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.album = option.id;
    button.setAttribute('aria-pressed', String(activeAlbum === option.id));
    button.innerHTML = `${escapeHTML(option.title)} <small>${option.count}</small>`;
    button.addEventListener('click', () => selectAlbum(option.id, false));
    return button;
  }));
}

function currentPhotos() {
  return allPhotos().filter(photo => activeAlbum === 'all' || photo.albumId === activeAlbum);
}

function renderAlbumIntro() {
  const selected = albums.find(album => album.id === activeAlbum);
  document.querySelector('#selected-album-title').textContent = selected?.title || '全部作品';
  document.querySelector('#selected-album-description').innerHTML = selected
    ? (albumInfoHTML(selected) || '本图集简介待填写。')
    : '从相册目录选择图集，逐张浏览完整作品。';
}

function selectAlbum(id, scroll) {
  activeAlbum = id;
  visibleCount = PAGE_SIZE;
  renderFilters();
  renderAlbumIntro();
  renderGallery();
  if (scroll) document.querySelector('#gallery-heading').scrollIntoView({behavior: 'smooth', block: 'start'});
}

function renderGallery() {
  activePhotos = currentPhotos();
  count.textContent = String(activePhotos.length).padStart(3, '0');
  const page = activePhotos.slice(0, visibleCount);
  gallery.replaceChildren(...page.map((photo, index) => {
    const button = document.createElement('button');
    button.className = 'photo-card';
    button.type = 'button';
    button.setAttribute('aria-label', `查看 ${photo.albumTitle} 的第 ${index + 1} 张照片`);
    button.innerHTML = `<img src="${photo.src}" alt="${escapeHTML(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async"><span class="photo-meta"><strong>${escapeHTML(photo.albumTitle)}</strong><span>${String(index + 1).padStart(2, '0')} / ${String(activePhotos.length).padStart(3, '0')}</span></span>`;
    button.addEventListener('click', () => openLightbox(index));
    return button;
  }));
  loadMore.hidden = visibleCount >= activePhotos.length;
}

function openLightbox(index) {
  activeIndex = index;
  updateLightbox();
  lightbox.showModal();
}

function updateLightbox() {
  const photo = activePhotos[activeIndex];
  if (!photo) return;
  lightboxImage.src = photo.src;
  lightboxImage.alt = photo.alt;
  lightboxCaption.textContent = photo.albumTitle;
  lightboxCounter.textContent = `${String(activeIndex + 1).padStart(3, '0')} / ${String(activePhotos.length).padStart(3, '0')}`;
}

function stepLightbox(amount) {
  activeIndex = (activeIndex + amount + activePhotos.length) % activePhotos.length;
  updateLightbox();
}

loadMore.addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  renderGallery();
});
document.querySelector('#lightbox-close').addEventListener('click', () => lightbox.close());
document.querySelector('#lightbox-prev').addEventListener('click', () => stepLightbox(-1));
document.querySelector('#lightbox-next').addEventListener('click', () => stepLightbox(1));
lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
document.addEventListener('keydown', event => {
  if (!lightbox.open) return;
  if (event.key === 'ArrowRight') stepLightbox(1);
  if (event.key === 'ArrowLeft') stepLightbox(-1);
});
document.querySelector('#year').textContent = new Date().getFullYear();

Promise.all([fetch('./works.json'), fetch('./site-content.json')])
  .then(async ([worksResponse, contentResponse]) => {
    if (!worksResponse.ok || !contentResponse.ok) throw new Error('作品或文案清单读取失败');
    return [await worksResponse.json(), await contentResponse.json()];
  })
  .then(([sourceAlbums, siteContent]) => {
    const contentById = new Map(siteContent.albums.map((item, index) => [item.id, {...item, position: index + 1}]));
    albums = sourceAlbums.map((source, index) => {
      const data = contentById.get(source.id) || {};
      return {
        ...source,
        title: data.title?.trim() || `未命名相册 ${String(index + 1).padStart(2, '0')}`,
        location: data.location?.trim() || '',
        gear: data.gear || [],
        coverIndexes: data.coverIndexes || [0, 1, 2],
      };
    });
    renderAuthor(siteContent);
    renderHero(siteContent);
    renderAlbumCards();
    renderFilters();
    renderAlbumIntro();
    renderGallery();
  })
  .catch(error => {
    gallery.innerHTML = `<p class="load-error">${escapeHTML(error.message)}。请从 README 中的本地预览方式启动页面。</p>`;
  });
