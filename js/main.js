(function(){
function loadCss(href){
  if(document.querySelector('link[data-lazy-css="'+href+'"]')) return;
  var l=document.createElement('link');
  l.rel='stylesheet'; l.href=href; l.dataset.lazyCss=href;
  document.head.appendChild(l);
}
function loadScript(src){
  return new Promise(function(resolve,reject){
    var existing=document.querySelector('script[data-lazy-script="'+src+'"]');
    if(existing){existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return;}
    var s=document.createElement('script');
    s.src=src; s.async=true; s.dataset.lazyScript=src;
    s.onload=resolve; s.onerror=reject; document.body.appendChild(s);
  });
}
function idle(fn){
  if('requestIdleCallback' in window) requestIdleCallback(fn,{timeout:1800});
  else setTimeout(fn,1200);
}
function bootNonCritical(){
  loadCss('css/aos.css');
  loadCss('css/swiper-bundle.min.css');
  Promise.allSettled([loadScript('js/aos.js'),loadScript('js/swiper-bundle.min.js')]).then(function(){
    if(window.AOS){
      window.AOS.init({duration:680,once:true,offset:55});
      window.AOS.refreshHard();
    }
    if(window.Swiper){ initTestimonialsSwiper(); }
  });
}
window.__bootNonCritical=bootNonCritical;
idle(bootNonCritical);
})();

let scrollTick = false;
window.addEventListener('scroll', function () {
if (scrollTick) return;
scrollTick = true;
requestAnimationFrame(function () {
scrollTick = false;
var y = window.scrollY;
var nav = document.getElementById('nav');
var btt = document.getElementById('btt');
if (nav) nav.classList.toggle('scrolled', y > 60);
if (btt) btt.classList.toggle('show', y > 300);
var activeId = '';
document.querySelectorAll('section[id]').forEach(function (sec) {
var top = sec.offsetTop - 110;
if (y >= top && y < top + sec.offsetHeight) activeId = sec.id;
});
document.querySelectorAll('.nav-link').forEach(function (link) {
link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
});
});
}, { passive: true });
document.querySelectorAll('a[href^="#"]').forEach(function(a) {
a.addEventListener('click', function(e) {
var href = this.getAttribute('href');
if (href === '#') return;
var t = document.querySelector(href);
if (t) {
e.preventDefault();
var navCollapse = document.getElementById('navmenu');
var navToggle = document.querySelector('.navbar-toggler');
if (navCollapse && navCollapse.classList.contains('show')) {
navCollapse.classList.remove('show');
if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
}
setTimeout(function() {
window.scrollTo({
top: t.offsetTop - 78,
behavior: 'smooth'
});
}, 50);
}
});
});
var navToggle = document.querySelector('.navbar-toggler');
var navMenu = document.getElementById('navmenu');
if (navToggle && navMenu) {
navToggle.addEventListener('click', function () {
var open = navMenu.classList.toggle('show');
navToggle.setAttribute('aria-expanded', String(open));
});
}
var searchOv = document.getElementById('searchOv');
document.getElementById('navSearchBtn').addEventListener('click', function() {
searchOv.classList.add('open');
document.body.style.overflow = 'hidden';
setTimeout(function() {
document.getElementById('searchInput').focus();
}, 220);
});
document.getElementById('searchClose').addEventListener('click', closeSearch);
searchOv.addEventListener('click', function(e) {
if (e.target === searchOv) closeSearch();
});
function closeSearch() {
searchOv.classList.remove('open');
document.body.style.overflow = '';
}
document.querySelectorAll('.sovcat').forEach(function(btn) {
btn.addEventListener('click', function() {
document.querySelectorAll('.sovcat').forEach(function(b) {
b.classList.remove('active');
});
this.classList.add('active');
var f = this.getAttribute('data-cat');
closeSearch();
setTimeout(function() {
filterMenu(f);
document.getElementById('menu').scrollIntoView({
behavior: 'smooth',
block: 'start'
});
}, 300);
});
});
document.querySelectorAll('.sovtrend .ttag').forEach(function(t) {
t.addEventListener('click', function() {
document.getElementById('searchInput').value = this.textContent.trim();
document.getElementById('searchInput').focus();
});
});
function filterMenu(cat) {
document.querySelectorAll('.filtbtn').forEach(function(b) {
b.classList.toggle('active', b.getAttribute('data-f') === cat);
});
document.querySelectorAll('.catcard').forEach(function(c) {
c.classList.toggle('active', c.getAttribute('data-filter') === cat);
});
document.querySelectorAll('.mwrap').forEach(function(w) {
var c = w.getAttribute('data-c');
if (cat === 'all' || c === cat) {
w.classList.remove('gone');
w.style.opacity = '0';
w.style.transform = 'translateY(16px)';
setTimeout(function() {
w.style.transition = 'opacity .38s,transform .38s';
w.style.opacity = '1';
w.style.transform = 'translateY(0)';
}, 60);
} else {
w.classList.add('gone');
}
});
}
document.querySelectorAll('.filtbtn').forEach(function(btn) {
btn.addEventListener('click', function() {
filterMenu(this.getAttribute('data-f'));
});
});
document.querySelectorAll('.catcard').forEach(function(card) {
card.addEventListener('click', function() {
var f = this.getAttribute('data-filter');
window.scrollTo({
top: document.getElementById('menu').offsetTop - 80,
behavior: 'smooth'
});
setTimeout(function() {
filterMenu(f);
}, 480);
});
});
var menuPop = document.getElementById('menuPop');
var mpQty = 1;
function openMenuPop(card) {
var img = card.getAttribute('data-img');
var title = card.getAttribute('data-title');
var cat = card.getAttribute('data-cat');
var price = card.getAttribute('data-price');
var old = card.getAttribute('data-old');
var rating = parseFloat(card.getAttribute('data-rating'));
var reviews = card.getAttribute('data-reviews');
var cal = card.getAttribute('data-cal');
var time = card.getAttribute('data-time');
var desc = card.getAttribute('data-desc');
var tags = card.getAttribute('data-tags') || '';
document.getElementById('mpImg').setAttribute('src', img);
document.getElementById('mpCat').textContent = cat;
document.getElementById('mpTitle').textContent = title;
var full = Math.round(rating),
empty = 5 - full;
document.getElementById('mpStars').innerHTML =
'<i class="fas fa-star"></i>'.repeat(full) + 'â˜†'.repeat(empty) +
' <span style="color:#bbb;font-size:.78rem;">' + rating + ' (' + reviews + ' reviews)</span>';
document.getElementById('mpDesc').textContent = desc;
document.getElementById('mpPrice').innerHTML =
price + (old ? '<small style="color:#ccc;text-decoration:line-through;margin-left:8px;font-size:1rem;">' + old + '</small>' : '');
document.getElementById('mpMeta').innerHTML =
'<div class="mpm"><div class="mpmv">' + cal + ' kcal</div><div class="mpml">Calories</div></div>' +
'<div class="mpm"><div class="mpmv">' + time + ' min</div><div class="mpml">Prep Time</div></div>' +
'<div class="mpm"><div class="mpmv">' + rating + '/5</div><div class="mpml">Rating</div></div>';
document.getElementById('mpTags').innerHTML =
tags.split(',').filter(Boolean).map(function(t) {
return '<span class="mptag">' + t.trim() + '</span>';
}).join('');
mpQty = 1;
document.getElementById('mpQnum').textContent = 1;
document.getElementById('mpAddCart').innerHTML = '<i class="fas fa-shopping-cart"></i> Add to Cart';
document.getElementById('mpAddCart').style.background = '';
menuPop.classList.add('open');
document.body.style.overflow = 'hidden';
}
document.querySelectorAll('.mcard').forEach(function(card) {
card.addEventListener('click', function() {
openMenuPop(this);
});
});
document.querySelectorAll('.madd').forEach(function(btn) {
btn.addEventListener('click', function(e) {
e.stopPropagation();
openMenuPop(this.closest('.mcard'));
});
});
document.querySelectorAll('.mhrt').forEach(function(btn) {
btn.addEventListener('click', function(e) {
e.stopPropagation();
var ico = this.querySelector('i');
ico.classList.toggle('far');
ico.classList.toggle('fas');
this.style.color = ico.classList.contains('fas') ? 'var(--primary)' : '#ccc';
});
});
document.getElementById('mpClose').addEventListener('click', closeMenuPop);
menuPop.addEventListener('click', function(e) {
if (e.target === this) closeMenuPop();
});
function closeMenuPop() {
menuPop.classList.remove('open');
document.body.style.overflow = '';
}
document.getElementById('mpPlus').addEventListener('click', function() {
document.getElementById('mpQnum').textContent = ++mpQty;
});
document.getElementById('mpMinus').addEventListener('click', function() {
if (mpQty > 1) document.getElementById('mpQnum').textContent = --mpQty;
});
document.getElementById('mpAddCart').addEventListener('click', function() {
var cnt = parseInt(document.getElementById('cartCount').textContent) + mpQty;
document.getElementById('cartCount').textContent = cnt;
this.innerHTML = '<i class="fas fa-check"></i> Added to Cart!';
this.style.background = 'linear-gradient(135deg,var(--green),#1a4a35)';
var self = this;
setTimeout(function() {
closeMenuPop();
self.innerHTML = '<i class="fas fa-shopping-cart"></i> Add to Cart';
self.style.background = '';
}, 1000);
});
document.getElementById('resBtn').addEventListener('click', function() {
var btn = this;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking...';
btn.disabled = true;
setTimeout(function() {
btn.innerHTML = '<i class="fas fa-calendar-check"></i> Confirm Reservation';
btn.disabled = false;
var ok = document.getElementById('resOk');
ok.style.display = 'block';
ok.scrollIntoView({
behavior: 'smooth',
block: 'nearest'
});
}, 1500);
});
var galPop = document.getElementById('galPop');
var galData = [];
var galIdx = 0;
document.querySelectorAll('.gitem').forEach(function(item) {
galData.push({
img: item.getAttribute('data-gimg'),
title: item.getAttribute('data-gtitle'),
desc: item.getAttribute('data-gdesc')
});
item.addEventListener('click', function() {
openGal(parseInt(this.getAttribute('data-gi')));
});
});
function openGal(i) {
galIdx = i;
var g = galData[i];
document.getElementById('gpImg').setAttribute('src', g.img);
document.getElementById('gpTitle').textContent = g.title;
document.getElementById('gpDesc').innerHTML = g.desc;
galPop.classList.add('open');
document.body.style.overflow = 'hidden';
}
document.getElementById('gpClose').addEventListener('click', closeGal);
galPop.addEventListener('click', function(e) {
if (e.target === this) closeGal();
});
function closeGal() {
galPop.classList.remove('open');
document.body.style.overflow = '';
}
document.getElementById('gpPrev').addEventListener('click', function() {
openGal((galIdx - 1 + galData.length) % galData.length);
});
document.getElementById('gpNext').addEventListener('click', function() {
openGal((galIdx + 1) % galData.length);
});
document.addEventListener('keydown', function(e) {
if (e.key === 'Escape') {
closeSearch();
closeMenuPop();
closeGal();
}
});
function initTestimonialsSwiper(){
  if(!window.Swiper || !document.querySelector('.tesSwiper') || window.__tesSwiperReady) return;
  window.__tesSwiperReady=true;
  new Swiper('.tesSwiper', {
  slidesPerView: 1,
  spaceBetween: 22,
  loop: true,
  autoplay: {
  delay: 4000,
  disableOnInteraction: false
  },
  pagination: {
  el: '.swiper-pagination',
  clickable: true
  },
  breakpoints: {
  640: {
  slidesPerView: 2
  },
  1024: {
  slidesPerView: 3
  }
  }
  });
}

var cH = 8,
cM = 45,
cS = 30;
setInterval(function() {
cS--;
if (cS < 0) {
cS = 59;
cM--;
}
if (cM < 0) {
cM = 59;
cH--;
}
if (cH < 0) {
cH = 8;
cM = 45;
cS = 30;
}
document.getElementById('cdH').textContent = String(cH).padStart(2, '0');
document.getElementById('cdM').textContent = String(cM).padStart(2, '0');
document.getElementById('cdS').textContent = String(cS).padStart(2, '0');
}, 1000);
document.getElementById('nlBtn').addEventListener('click', function() {
var email = document.getElementById('nlEmail').value;
if (email && email.includes('@')) {
var btn = this;
btn.textContent = 'âœ“ Subscribed!';
btn.style.background = '#4ade80';
btn.style.color = '#222';
document.getElementById('nlEmail').value = '';
setTimeout(function() {
btn.textContent = 'Subscribe';
btn.style.background = '';
btn.style.color = '';
}, 3000);
}
});
var numAnimated = false;
window.addEventListener('scroll', function() {
var hero = document.getElementById('hero');
if (!numAnimated && hero && window.scrollY > hero.offsetHeight - 300) {
numAnimated = true;
document.querySelectorAll('.snum').forEach(function(el) {
var txt = el.textContent;
var num = parseInt(txt);
var suf = txt.replace(/[0-9]/g, '');
if (isNaN(num)) return;
var start = 0;
var step = Math.ceil(num / 55);
var iv = setInterval(function() {
start += step;
if (start >= num) {
start = num;
clearInterval(iv);
}
el.textContent = start + suf;
}, 1400 / 55);
});
}
});
