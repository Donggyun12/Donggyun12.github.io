/* 마스크 SDEdit 수리 재생기 — 탈락 타일 6장을 한 화면에 두고, Repair 를 누르면 모두 제자리에서 서서히 수리된다.
   브라우저에서 모델을 돌리지는 않는다 — 실제 샘플링(DDIM 100스텝) 때 저장한 스텝별 그림을 재생한다 (수리 영상과 같은 그림 규칙).
   데이터: odc/demo/  (우주데이터센터 저장소의 분석도구/export_web_repair_grid.py 가 만든다)
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
    const grid=q('.rg-grid'),word=q('.rg-word'),phase=q('.phase'),mark=q('.tbar-mark'),scrub=q('.tbar-input'),
          runBtn=q('[data-act=run]'),resetBtn=q('[data-act=reset]');
    let d;
    try{d=await getJSON(base+'demo.json');}
    catch(e){phase.textContent='The demo could not load its data — the video below shows the same repair.';runBtn.textContent='Unavailable';return;}
    const S=d.size,dur=durations(d),last=d.n-1;
    const pcts=d.tiles.map(t=>t.changed_outside*100),lo=Math.min(...pcts).toFixed(1),hi=Math.max(...pcts).toFixed(1);

    // 타일 칸 만들기
    const cells=d.tiles.map(t=>{
      const fig=document.createElement('figure');fig.className='rg-tile';
      fig.innerHTML=`<div class="rg-box"><img class="before" src="${base}t${t.id}_before.png" alt="Failed ${t.family} tile, channel width ${t.width} px">`+
        `<canvas width="512" height="512" aria-hidden="true"></canvas><img class="hole" src="${base}t${t.id}_hole.png" alt=""></div>`+
        `<figcaption><span class="fam">${t.family} · ${t.width} px</span><span class="st"></span></figcaption>`;
      grid.appendChild(fig);
      const cv=fig.querySelector('canvas');
      return {t,fig,cv,ctx:cv.getContext('2d'),hole:fig.querySelector('.hole'),st:fig.querySelector('.st'),sprite:null};
    });

    let pos=0,raf=0,state='idle',loaded=0;
    function blit(c,j,alpha){
      const col=j%d.cols,row=Math.floor(j/d.cols);
      c.ctx.globalAlpha=alpha;c.ctx.drawImage(c.sprite,col*S,row*S,S,S,0,0,c.cv.width,c.cv.height);
    }
    function tAt(p){const j=Math.floor(p),f=p-j;return j<last?d.t[j]+(d.t[j+1]-d.t[j])*f:0;}
    function pOfT(t){                                   // 막대 위치(t) → 프레임 위치. t = 999 는 '점선 안이 노이즈' 상태, t = 0 은 결과
      if(t<=0)return last;
      for(let j=1;j<last;j++){if(d.t[j+1]<=t){const g=d.t[j]-d.t[j+1];return g>0?j+(d.t[j]-t)/g:j;}}
      return last;
    }
    function draw(p){                                   // 6장 모두 같은 프레임 위치 — 이웃 두 프레임을 섞어 부드럽게
      p=clamp(p,0,last);pos=p;const j=Math.floor(p),f=p-j;
      cells.forEach(c=>{if(!c.sprite)return;blit(c,j,1);if(f>0&&j<last)blit(c,j+1,f);c.ctx.globalAlpha=1;});
      const t=tAt(p),hole=1-clamp(p-(d.release-1),0,1);  // 바깥이 풀릴 때 점선이 서서히 사라짐
      cells.forEach(c=>{c.hole.style.opacity=hole;});
      mark.style.left=(100*(999-t)/999)+'%';scrub.value=Math.round(999-t);
      if(state!=='done'&&state!=='idle')
        phase.innerHTML=t>d.t_release
          ?`<b>① t = 999 → 850 · outside held.</b> Each box starts from noise. Outside it, the original tile is put back at every step, so the new channel has to fit its surroundings. <span class="t-now">t = ${Math.round(t)}</span>`
          :`<b>② t &lt; 850 · outside released.</b> The whole tile is now denoised together, so each seam blends in; channels just outside a box may shift a little. <span class="t-now">t = ${Math.round(t)}</span>`;
    }
    function setState(s){
      state=s;root.dataset.state=s;
      word.textContent=s==='idle'?'Fail':s==='done'?'Pass':'Masked SDEdit';
      word.className='rg-word '+(s==='idle'?'fail':s==='done'?'pass':'run');
      runBtn.textContent=s==='run'?'❚❚ Pause':s==='pause'?'▶ Resume':s==='done'?'↺ Repair again':'▶ Repair with masked SDEdit';
      resetBtn.disabled=s==='idle';
      cells.forEach(c=>{
        c.st.className='st '+(s==='done'?'ok':s==='idle'?'bad':'');
        c.st.textContent=s==='done'?`✓ passes · ${(c.t.changed_outside*100).toFixed(1)} % outside changed`
                        :s==='idle'?`✕ ${c.t.why.join(' · ')}`:'repairing…';
      });
      if(s==='idle')phase.innerHTML=`Six generated tiles that failed the gates — in each one the channel breaks inside the dashed box. Press <b>Repair</b>: every box is erased and re-drawn by the same diffusion model, with no extra training and no hand editing.`;
      if(s==='done')phase.innerHTML=`<b>③ All six pass</b> the same gates the training data passed. Only ${lo}–${hi} % of the pixels outside the boxes changed.`;
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
    function play(from){
      stop();let p=from,prev=performance.now();
      const step=now=>{
        const dt=clamp(now-prev,0,100);prev=now;           // 탭이 가려졌다 돌아와도 한 번에 건너뛰지 않게. 첫 프레임 시각은 클릭보다 이를 수 있어 음수를 막음
        p+=dt/dur[clamp(Math.floor(p),0,last-1)];
        if(p>=last){draw(last);raf=0;setState('done');return;}
        draw(p);raf=requestAnimationFrame(step);
      };
      raf=requestAnimationFrame(step);
    }
    function reset(){stop();setState('idle');draw(0);}

    runBtn.addEventListener('click',()=>{
      if(loaded<cells.length)return;
      if(state==='run'){stop();setState('pause');return;}
      const from=state==='pause'?pos:0;
      setState('run');draw(from);play(from);
    });
    resetBtn.addEventListener('click',reset);
    scrub.addEventListener('input',()=>{
      if(loaded<cells.length)return;stop();
      const p=pOfT(999-(+scrub.value));
      if(p>=last){draw(last);setState('done');return;}
      setState('pause');draw(p);
    });

    // 프레임 받기 (6장 다 받아야 재생 가능)
    setState('idle');runBtn.disabled=true;scrub.disabled=true;runBtn.textContent=`Loading frames… 0 / ${cells.length}`;
    await Promise.all(cells.map(c=>loadImg(`${base}t${c.t.id}_frames.webp`).then(im=>{
      c.sprite=im;loaded++;
      if(state==='idle'){blit(c,0,1);c.ctx.globalAlpha=1;}
      if(loaded<cells.length)runBtn.textContent=`Loading frames… ${loaded} / ${cells.length}`;
    }).catch(()=>{})));
    if(loaded<cells.length){runBtn.textContent='Frames failed to load';return;}
    runBtn.disabled=false;scrub.disabled=false;setState('idle');draw(0);
  }

  return {initDemo};
})();
