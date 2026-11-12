/* 두 페이지가 같이 쓰는 동작: 모바일 메뉴 · 메뉴 따라가기 · 스크롤 등장 · 이메일 복사 · 그림 확대(라이트박스).
   [EDIT] 그림을 확대 목록에 넣으려면 <img data-lb data-cap="설명"> 만 붙이면 됩니다 (번호 매길 필요 없음). */

/* ---------- mobile menu ---------- */
const toggle=document.querySelector('.nav-toggle');
const links=document.querySelector('.nav-links');
if(toggle&&links){
  toggle.addEventListener('click',()=>{
    const open=links.classList.toggle('open');
    toggle.setAttribute('aria-expanded',open);
  });
  links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>links.classList.remove('open')));
}

/* ---------- scroll spy (active pill follows section; 같은 페이지 안 #링크만) ---------- */
const navAnchors=[...document.querySelectorAll('.nav-links a[href^="#"]')];
const spy=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      navAnchors.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id));
    }
  });
},{rootMargin:'-45% 0px -50% 0px'});
navAnchors.forEach(a=>{const s=document.querySelector(a.getAttribute('href'));if(s)spy.observe(s);});

/* ---------- scroll reveal ---------- */
const revealer=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('in');revealer.unobserve(e.target);}
  });
},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>revealer.observe(el));

/* ---------- copy email ---------- */
function copyEmail(btn){
  navigator.clipboard.writeText('ehdrbs123450@hanyang.ac.kr').then(()=>{
    const hint=btn.querySelector('.copy-hint');
    const orig=hint.textContent;
    hint.textContent='copied!';
    setTimeout(()=>hint.textContent=orig,1600);
  });
}

/* ---------- lightbox: data-lb 가 붙은 그림을 문서 순서대로 모은다 ---------- */
const lbImages=[...document.querySelectorAll('img[data-lb]')];
let lbIndex=0;
const lb=document.getElementById('lightbox');
function openLightbox(i){
  lbIndex=i;updateLightbox();
  lb.classList.add('open');
}
function closeLightbox(){
  lb.classList.remove('open');
}
function navLightbox(d){
  lbIndex=(lbIndex+d+lbImages.length)%lbImages.length;updateLightbox();
}
function updateLightbox(){
  const im=lbImages[lbIndex];
  document.getElementById('lightbox-img').src=im.dataset.full||im.currentSrc||im.src;
  document.getElementById('lightbox-caption').textContent=im.dataset.cap||im.alt;
}
if(lb){
  lbImages.forEach((im,i)=>{im.style.cursor='zoom-in';im.addEventListener('click',()=>openLightbox(i));});
  lb.addEventListener('click',e=>{if(e.target===lb)closeLightbox();});
  document.addEventListener('keydown',e=>{
    if(!lb.classList.contains('open'))return;
    if(e.key==='Escape')closeLightbox();
    if(e.key==='ArrowLeft')navLightbox(-1);
    if(e.key==='ArrowRight')navLightbox(1);
  });
}

/* ---------- 자동 재생 영상: '움직임 줄이기' 를 켠 방문자에게는 멈춘 첫 장면 + 재생 버튼 (조작 막대가 있는 영상은 방문자가 직접 멈출 수 있으니 그대로 재생) ---------- */
if(matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.querySelectorAll('video[autoplay]:not([controls])').forEach(v=>{v.removeAttribute('autoplay');v.pause();v.controls=true;});
}
