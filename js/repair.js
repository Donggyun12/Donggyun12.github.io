/* 마스크 SDEdit 수리 재생기 — 탈락 타일을 한 장씩 보여 주고, Repair 를 누르면 제자리에서 서서히 수리된다.
   Next failed tile 을 누르면 다음 탈락 타일이 나온다 (아래 = 몇 번째 타일 · 고친 수; 12장 이하면 점으로, 고친 타일은 초록).
   브라우저에서 모델을 돌리지는 않는다 — 실제 샘플링(DDIM 100스텝) 때 저장한 스텝별 그림을 재생한다 (수리 영상과 같은 그림 규칙).
   데이터: odc/demo/  (우주데이터센터 저장소의 분석도구/record_repair_web.py 가 연구실 서버에서 만든다 — gen_500 탈락 200장 중 고친 198장)
     demo.json            프레임별 t · 바깥이 풀리는 프레임(release) · 타일별 계열·폭·탈락 사유·구멍 밖 변화율
     t<id>_frames.webp    프레임 격자 (한 칸 size px, cols 열). 0 = 원본, 1 = 점선 안을 노이즈로, 2.. = 스텝, 마지막 = 결과
     t<id>_before.png     프레임을 받는 동안 먼저 보일 원본
     t<id>_hole.png       점선 테두리 (투명 배경) */
const Repair=(()=>{
  const loadImg=src=>new Promise((ok,err)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=err;i.src=src;});
  const getJSON=src=>fetch(src).then(r=>{if(!r.ok)throw new Error(src);return r.json();});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

  // 프레임 j → j+1 에 걸리는 시간(ms): 지우기·바깥 고정 구간은 천천히, 풀린 뒤 모양이 잡히는 매 스텝 구간은 보통,
  // 몇 스텝씩 건너뛰는 끝 구간(거의 안 바뀜)은 빠르게, 마지막에 검정으로 굳는 건 천천히 (영상 v8 처럼 v7 보다 약 1.4배 느림)
  function durations(d){
    return d.t.map((t,j)=>j===0?800:j===1?400:j<d.release-1?(j<8?320:155):j===d.release-1?800:j>=d.n-2?600:
      (d.t[j]-d.t[j+1]<=11?95:65));
  }

  async function initDemo(root){
    const base=root.dataset.base,q=s=>root.querySelector(s);
    const cv=q('canvas'),ctx=cv.getContext('2d'),before=q('.before'),hole=q('.hole'),fam=q('.fam'),st=q('.st'),
          word=q('.rg-word'),phase=q('.phase'),mark=q('.tbar-mark'),scrub=q('.tbar-input'),dotsEl=q('.rg-dots'),
          runBtn=q('[data-act=run]'),nextBtn=q('[data-act=next]');
    let d;
    try{d=await getJSON(base+'demo.json');}
    catch(e){phase.textContent='The demo could not load its data — the video below shows the same repair.';runBtn.textContent='Unavailable';return;}
    const S=d.size,dur=durations(d),last=d.n-1,total=d.tiles.length;

    // 프레임 격자는 타일마다 한 번만 받는다 (지금 타일 + 다음 타일 미리)
    const sprites=new Map();
    const getSprite=t=>{if(!sprites.has(t.id))sprites.set(t.id,loadImg(`${base}t${t.id}_frames.webp`));return sprites.get(t.id);};

    // 아래 점: 몇 번째 타일인지 · 고친 타일은 초록 (눌러서 바로 갈 수도 있다). 타일이 많으면(12장 넘게) 점 없이 숫자만
    const dots=(total<=12?d.tiles:[]).map((t,i)=>{
      const b=document.createElement('button');b.type='button';b.className='rg-dot';
      b.setAttribute('aria-label',`Failed tile ${i+1} of ${total}: ${t.family}, channel width ${t.width} px`);
      b.addEventListener('click',()=>show(i));dotsEl.appendChild(b);return b;
    });
    const count=document.createElement('span');count.className='rg-count';dotsEl.appendChild(count);

    const done=new Set();let idx=0,cur=null,sprite=null,pos=0,raf=0,state='idle',token=0;
    const pct=()=>(cur.changed_outside*100).toFixed(1);
    const whole=()=>cur.changed_outside==null;          // 구멍이 타일 전체 = 바깥이 없음 (타일을 통째로 다시 그림)
    function blit(j,alpha){
      const col=j%d.cols,row=Math.floor(j/d.cols);
      ctx.globalAlpha=alpha;ctx.drawImage(sprite,col*S,row*S,S,S,0,0,cv.width,cv.height);
    }
    function tAt(p){const j=Math.floor(p),f=p-j;return j<last?d.t[j]+(d.t[j+1]-d.t[j])*f:0;}
    function pOfT(t){                                   // 막대 위치(t) → 프레임 위치. t = 999 는 '점선 안이 노이즈' 상태, t = 0 은 결과
      if(t<=0)return last;
      for(let j=1;j<last;j++){if(d.t[j+1]<=t){const g=d.t[j]-d.t[j+1];return g>0?j+(d.t[j]-t)/g:j;}}
      return last;
    }
    function draw(p){                                   // 이웃 두 프레임을 섞어 부드럽게
      p=clamp(p,0,last);pos=p;const j=Math.floor(p),f=p-j;
      if(sprite){blit(j,1);if(f>0&&j<last)blit(j+1,f);ctx.globalAlpha=1;}
      const t=tAt(p);
      hole.style.opacity=1-clamp(p-(d.release-1),0,1);  // 바깥이 풀릴 때 점선이 서서히 사라짐
      mark.style.left=(100*(999-t)/999)+'%';scrub.value=Math.round(999-t);
      if(state!=='done'&&state!=='idle')
        phase.innerHTML=t>d.t_release
          ?`<b>① t = 999 → 850 · outside held.</b> The box starts from noise. Outside it, the original tile is put back at every step, so the new channel has to fit its surroundings. <span class="t-now">t = ${Math.round(t)}</span>`
          :`<b>② t &lt; 850 · outside released.</b> The whole tile is now denoised together, so the seam blends in; channels just outside the box may shift a little. <span class="t-now">t = ${Math.round(t)}</span>`;
    }
    function updCount(){count.textContent=`Failed tile ${idx+1} / ${total} · ${done.size} repaired`;}
    function setState(s){
      state=s;root.dataset.state=s;
      word.textContent=s==='idle'?'Fail':s==='done'?'Pass':'Masked SDEdit';
      word.className='rg-word '+(s==='idle'?'fail':s==='done'?'pass':'run');
      runBtn.textContent=s==='run'?'❚❚ Pause':s==='pause'?'▶ Resume':s==='done'?'↺ Repair again':'▶ Repair with masked SDEdit';
      runBtn.className='btn btn-lg '+(s==='done'?'btn-ghost':'btn-dark');    // 다 고치면 다음 타일 버튼을 진하게
      nextBtn.className='btn btn-lg '+(s==='done'?'btn-dark':'btn-ghost');
      st.className='st '+(s==='done'?'ok':s==='idle'?'bad':'');
      st.textContent=s==='done'?(whole()?'✓ passes · whole tile re-drawn':`✓ passes · ${pct()} % of outside pixels changed`):s==='idle'?`✕ ${cur.why.join(' · ')}`:'repairing…';
      if(s==='idle')phase.innerHTML=`This generated <b>${cur.family}</b> tile failed the gates; the dashed box marks the region around the defect. Press <b>Repair</b>: the box is erased and re-drawn by the same diffusion model, with no extra training and no hand editing.`;
      if(s==='done')phase.innerHTML=`<b>③ Passes</b> the same gates the training data passed. `+
        (whole()?`Here the box covered the whole tile, so the entire tile was re-drawn.`:`Only ${pct()} % of the pixels outside the box changed.`)+
        ` Press <b>Next failed tile</b> for another one.`;
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
    function finish(){
      setState('done');done.add(cur.id);if(dots[idx])dots[idx].classList.add('done');updCount();
    }
    function play(from){
      stop();let p=from,prev=performance.now();
      const step=now=>{
        const dt=clamp(now-prev,0,100);prev=now;           // 탭이 가려졌다 돌아와도 한 번에 건너뛰지 않게. 첫 프레임 시각은 클릭보다 이를 수 있어 음수를 막음
        p+=dt/dur[clamp(Math.floor(p),0,last-1)];
        if(p>=last){draw(last);raf=0;finish();return;}
        draw(p);raf=requestAnimationFrame(step);
      };
      raf=requestAnimationFrame(step);
    }

    async function show(i){
      const my=++token;stop();idx=i;cur=d.tiles[i];sprite=null;
      before.src=`${base}t${cur.id}_before.png`;before.alt=`Failed ${cur.family} tile, channel width ${cur.width} px`;
      hole.src=`${base}t${cur.id}_hole.png`;ctx.clearRect(0,0,cv.width,cv.height);
      fam.textContent=`${cur.family} · channel width ${cur.width} px`;
      dots.forEach((b,k)=>{b.classList.toggle('cur',k===i);b.setAttribute('aria-current',k===i?'true':'false');});updCount();
      setState('idle');draw(0);
      runBtn.disabled=true;scrub.disabled=true;runBtn.textContent='Loading frames…';
      let im;
      try{im=await getSprite(cur);}catch(e){if(my===token)runBtn.textContent='Frames failed to load';return;}
      if(my!==token)return;                              // 그 사이 다른 타일로 넘어갔으면 버림
      sprite=im;runBtn.disabled=false;scrub.disabled=false;setState('idle');draw(0);
      getSprite(d.tiles[(i+1)%total]).catch(()=>{});     // 다음 타일 미리 받기
    }

    runBtn.addEventListener('click',()=>{
      if(!sprite)return;
      if(state==='run'){stop();setState('pause');return;}
      const from=state==='pause'?pos:0;
      setState('run');draw(from);play(from);
    });
    nextBtn.addEventListener('click',()=>show((idx+1)%total));
    scrub.addEventListener('input',()=>{
      if(!sprite)return;stop();
      const p=pOfT(999-(+scrub.value));
      if(p>=last){draw(last);finish();return;}
      setState('pause');draw(p);
    });

    nextBtn.disabled=false;
    show(0);
  }

  return {initDemo};
})();
