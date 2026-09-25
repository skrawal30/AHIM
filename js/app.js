document.addEventListener("DOMContentLoaded", function () {
const fields = document.querySelectorAll("#assignment-form .live-input");
fields.forEach(function (field) {
function updateStatus() {
const wrapper = field.closest(".live-field");
if (!wrapper) return;
const status = wrapper.querySelector(".field-status");
if (!status) return;
if (field.value && String(field.value).trim() !== "") {
status.innerHTML = '<i class="fas fa-check-circle"></i>';
status.style.color = "#22c55e";
wrapper.classList.add("field-valid");
} else {
status.innerHTML = '<i class="fas fa-circle"></i>';
status.style.color = "#cbd5e1";
wrapper.classList.remove("field-valid");
}
}
field.addEventListener("focus", function () {
const wrapper = this.closest(".live-field");
if (wrapper) wrapper.classList.add("field-active");
});
field.addEventListener("blur", function () {
const wrapper = this.closest(".live-field");
if (wrapper) wrapper.classList.remove("field-active");
});
field.addEventListener("input", updateStatus);
field.addEventListener("change", updateStatus);
});
const deadlineDate = document.getElementById("deadlineDate");
const deadlineTime = document.getElementById("deadlineTime");
function getLocalDate() {
const now = new Date();
return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
if (deadlineDate) {
deadlineDate.min = getLocalDate();
deadlineDate.addEventListener("change", function () {
if (this.value && this.value < getLocalDate()) {
this.value = getLocalDate();
this.setCustomValidity("Please select today or a future date.");
} else {
this.setCustomValidity("");
}
});
}
const fileInput = document.getElementById("assignmentFile");
const fileUploadBox = document.getElementById("fileUploadBox");
const fileUploadTitle = document.getElementById("fileUploadTitle");
const fileUploadHint = document.getElementById("fileUploadHint");
const attachmentList = document.getElementById("attachmentList");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 20;
let selectedFiles = [];
function fileIcon(file) {
const type = (file.type || "").toLowerCase();
const name = file.name.toLowerCase();
if (type.includes("pdf") || name.endsWith(".pdf")) return "fa-file-pdf";
if (type.includes("word") || /\.(doc|docx)$/.test(name)) return "fa-file-word";
if (type.includes("sheet") || type.includes("excel") || /\.(xls|xlsx)$/.test(name)) return "fa-file-excel";
if (type.includes("presentation") || /\.(ppt|pptx)$/.test(name)) return "fa-file-powerpoint";
if (type.startsWith("image/")) return "fa-file-image";
if (type.startsWith("video/")) return "fa-file-video";
if (type.startsWith("audio/")) return "fa-file-audio";
if (type.includes("zip") || type.includes("compressed") || /\.(zip|rar|7z|tar|gz)$/.test(name)) return "fa-file-archive";
if (type.includes("text") || /\.(txt|md|rtf)$/.test(name)) return "fa-file-alt";
return "fa-file";
}
function formatFileSize(bytes) {
if (bytes < 1024) return `${bytes} B`;
if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function escapeHtml(value) {
return String(value).replace(/[&<>"']/g, function (char) {
return ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
})[char];
});
}
// FormData is populated explicitly at submit time, so there is no need to
// clone every selected File into extra hidden file inputs. This avoids a costly
// DataTransfer/FileList rebuild on every attachment change.
function renderAttachments() {
if (!attachmentList) return;
attachmentList.innerHTML = "";
selectedFiles.forEach(function (file, index) {
const row = document.createElement("div");
row.className = "attachment-item";
row.innerHTML = `
<span class="attachment-file-icon"><i class="fas ${fileIcon(file)}"></i></span>
<span class="attachment-file-info">
<strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
<small>${escapeHtml(file.type || "File")} • ${formatFileSize(file.size)}</small>
</span>
<button type="button" class="attachment-remove" data-index="${index}" aria-label="Delete ${escapeHtml(file.name)}" title="Delete file">
<i class="fas fa-trash-alt"></i>
</button>
`;
attachmentList.appendChild(row);
});
const count = selectedFiles.length;
if (fileUploadBox) fileUploadBox.classList.toggle("file-attached", count > 0);
if (fileUploadTitle) {
fileUploadTitle.textContent = count
? `${count} attachment${count === 1 ? "" : "s"} ready`
: "Attach Assignment";
}
if (fileUploadHint) {
fileUploadHint.textContent = count
? `${count} file${count === 1 ? "" : "s"} selected • Click to add more`
: "Click to choose files";
}
}

/* Attach the listeners once, outside renderAttachments(). */
if (fileInput) {
fileInput.addEventListener("change", function () {
const incoming = Array.from(this.files || []);
const rejected = [];
incoming.forEach(function (file) {
if (file.size > MAX_FILE_SIZE) {
rejected.push(`${file.name} (over 20 MB)`);
return;
}
if (selectedFiles.length >= MAX_FILES) {
rejected.push(`${file.name} (20-file limit reached)`);
return;
}
const duplicate = selectedFiles.some(function (existing) {
return existing.name === file.name &&
existing.size === file.size &&
existing.lastModified === file.lastModified;
});
if (!duplicate) selectedFiles.push(file);
});
if (rejected.length) {
alert("These files were not added:\n\n" + rejected.join("\n"));
}
/* Clear native picker so the same file can be selected again. */
this.value = "";
renderAttachments();
});
}
if (attachmentList) {
attachmentList.addEventListener("click", function (event) {
const button = event.target.closest(".attachment-remove");
if (!button) return;
event.preventDefault();
event.stopPropagation();
const index = Number(button.dataset.index);
if (!Number.isInteger(index) || index < 0 || index >= selectedFiles.length) return;
selectedFiles.splice(index, 1);
renderAttachments();
});
}
/* =====================================================
LOCAL BACKEND FORM SUBMISSION
Same-origin: /api/submissions
No FormSubmit/FormBold/static-form provider is used.
===================================================== */
const form = document.getElementById("assignment-form");
const submitButton = document.getElementById("ctcBtn");
/* =====================================================
ORDER ID
AH + HHMM + DD + MM + YY (visitor local time)
Example: 2:18 PM on 09/09/2026 -> AH1418090926
===================================================== */
function generateOrderId(date) {
const d = date || new Date();
const hhmm = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");
const month = String(d.getMonth() + 1).padStart(2, "0");
const year = String(d.getFullYear()).slice(-2);
return `AH${hhmm}${day}${month}${year}`;
}
if (form) {
form.addEventListener("submit", async function (event) {
event.preventDefault();
if (deadlineDate && deadlineTime) {
if (!deadlineDate.value || !deadlineTime.value) {
alert("Please select your assignment deadline date and time.");
return;
}
}
if (!form.checkValidity()) {
form.reportValidity();
return;
}
// Generate the customer-facing Order ID at the moment submission starts.
const orderId = generateOrderId(new Date());
const oldHtml = submitButton ? submitButton.innerHTML : "";
if (submitButton) {
submitButton.disabled = true;
submitButton.innerHTML =
'<span class="submit-icon"><i class="fas fa-spinner fa-spin"></i></span>' +
'<span>Sending...</span>';
}
try {
/*
 * Build the multipart body explicitly.
 * This avoids relying on the browser's native file input state after
 * the picker has been cleared by the attachment UI.
 */
const data = new FormData();

new FormData(form).forEach(function (value, key) {
if (key !== "assignmentFiles" &&
    key !== "assignmentFilePicker" &&
    key !== "assignmentFile") {
data.append(key, value);
}
});

data.set("order_id", orderId);

selectedFiles.forEach(function (file) {
data.append("assignmentFiles", file, file.name);
});

const response = await fetch("/api/submissions", {
method: "POST",
body: data,
headers: {
"Accept": "application/json"
}
});
let result = {};
try {
result = await response.json();
} catch {
throw new Error("The server returned an invalid response.");
}
if (!response.ok || !result.success) {
throw new Error(result.message || "Unable to submit the assignment.");
}
form.reset();
selectedFiles.length = 0;
renderAttachments();
const success = document.getElementById("ctcOk");
if (success) {
success.style.display = "block";
success.innerHTML =
'<i class="fas fa-check-circle"></i>' +
'<p>Thanks! Your Requirements Was Submitted. Your Order # <strong>' +
(result.orderId || orderId) + '</strong></p>';
success.scrollIntoView({
behavior: "smooth",
block: "center"
});
} else {
alert("Thanks! Your Requirements Was Submitted. Your Order # " + (result.orderId || orderId));
}
} catch (error) {
console.error("Local backend submission error:", error);
alert(error.message || "Unable to submit the assignment. Please try again.");
} finally {
if (submitButton) {
submitButton.disabled = false;
submitButton.innerHTML = oldHtml;
}
}
});
}
});

;
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
