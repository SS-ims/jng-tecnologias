// scripts/main.js
// Main interactions: nav toggle, reel drag+swipe with inertia, cart, chat integration (calls /api/chat),
// and Checkout integration (POST /create-checkout-session)

document.addEventListener('DOMContentLoaded', function(){

  // NAV TOGGLE for small screens
  const sideNav = document.querySelector('.side-nav');
  const main = document.querySelector('.main');
  const toggle = document.getElementById('menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', ()=>{
      sideNav.classList.toggle('hidden');
      main.classList.toggle('full');
    });
  }

  // ---------------------------
  // REEL: drag / swipe + inertia
  // ---------------------------
  const reel = document.querySelector('.reel');
  const leftBtn = document.getElementById('reel-left');
  const rightBtn = document.getElementById('reel-right');

  if (reel) {
    let isDown = false;
    let startX = 0;
    let currentTranslate = 0;      // current transformX value (positive value = moved left)
    let prevTranslate = 0;
    let velocity = 0;
    let lastTime = 0;
    let rafId = null;
    const clampMax = () => {
      // maximum translate based on total width minus container width
      const container = reel.parentElement;
      const totalWidth = reel.scrollWidth;
      const visible = container.clientWidth;
      return Math.max(0, totalWidth - visible);
    };

    function setTranslate(x) {
      // clamp
      const max = clampMax();
      currentTranslate = Math.max(0, Math.min(x, max));
      reel.style.transform = `translateX(-${currentTranslate}px)`;
    }

    function animateInertia(){
      // friction
      velocity *= 0.95;
      if (Math.abs(velocity) < 0.02) {
        velocity = 0;
        cancelAnimationFrame(rafId);
        rafId = null;
        return;
      }
      setTranslate(currentTranslate + velocity);
      rafId = requestAnimationFrame(animateInertia);
    }

    // Pointer / touch start
    const pointerDown = (clientX) => {
      isDown = true;
      startX = clientX;
      prevTranslate = currentTranslate;
      velocity = 0;
      lastTime = performance.now();
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    };
    const pointerMove = (clientX) => {
      if (!isDown) return;
      const dx = clientX - startX;
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      // invert dx: dragging left should move reel right (increase translate)
      const next = prevTranslate - dx;
      // compute velocity (px per frame)
      velocity = (currentTranslate - next) / (dt / 16.66); // normalized
      setTranslate(next);
      lastTime = now;
    };
    const pointerUp = () => {
      if (!isDown) return;
      isDown = false;
      // start inertia if velocity present
      if (Math.abs(velocity) > 0.5) {
        // limit velocity magnitude
        velocity = Math.max(-60, Math.min(60, velocity));
        rafId = requestAnimationFrame(animateInertia);
      } else {
        velocity = 0;
      }
    };

    // Mouse events
    reel.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pointerDown(e.clientX);
    });
    window.addEventListener('mousemove', (e) => pointerMove(e.clientX));
    window.addEventListener('mouseup', pointerUp);

    // Touch events
    reel.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      pointerDown(t.clientX);
    }, {passive:true});
    reel.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      pointerMove(t.clientX);
    }, {passive:true});
    reel.addEventListener('touchend', pointerUp);

    // Buttons fallback (also reset velocity)
    if (rightBtn) rightBtn.addEventListener('click', ()=> { setTranslate(currentTranslate + 336); velocity = 0; });
    if (leftBtn) leftBtn.addEventListener('click', ()=> { setTranslate(Math.max(0, currentTranslate - 336)); velocity = 0; });
  }

  // ---------------------------
  // CART functionality (client-side)
  // ---------------------------
  function getCart(){ return JSON.parse(localStorage.getItem('cart') || '[]'); }
  function saveCart(c){ localStorage.setItem('cart', JSON.stringify(c)); }
  const cartList = document.getElementById('cart-list');
  const cartCountElems = [document.getElementById('cart-count'), document.getElementById('cart-count-small')].filter(Boolean);

  function renderCart(){
    const current = getCart();
    cartCountElems.forEach(el => el.textContent = current.reduce((s,i)=>s+i.qty,0));
    if (!cartList) return;
    cartList.innerHTML = '';
    if(current.length===0){
      cartList.innerHTML = '<div style="padding:12px;color:#666">Cart is empty</div>';
      return;
    }
    current.forEach(item=>{
      const div = document.createElement('div');
      div.style.display='flex';
      div.style.gap='8px';
      div.style.alignItems='center';
      div.style.padding='8px 0';
      div.innerHTML = `<img src="${item.image}" style="width:60px;height:40px;object-fit:cover;border-radius:6px">
        <div style="flex:1"><strong>${item.title}</strong><div style="color:#666;font-size:13px">${item.price}</div></div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div>
            <button class="qty-decr" data-id="${item.id}">−</button>
            <span style="padding:0 8px">${item.qty}</span>
            <button class="qty-incr" data-id="${item.id}">+</button>
          </div>
          <button data-id="${item.id}" class="remove">Remove</button>
        </div>`;
      cartList.appendChild(div);
    });
    // attach handlers
    cartList.querySelectorAll('.remove').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.target.dataset.id;
        const c = getCart();
        const idx = c.findIndex(ci=>ci.id===id);
        if(idx>-1){ c.splice(idx,1); saveCart(c); renderCart(); }
      });
    });
    cartList.querySelectorAll('.qty-incr').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id=e.target.dataset.id; const c=getCart(); const it=c.find(x=>x.id===id); if(it){ it.qty+=1; saveCart(c); renderCart(); }
      });
    });
    cartList.querySelectorAll('.qty-decr').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id=e.target.dataset.id; const c=getCart(); const it=c.find(x=>x.id===id); if(it){ it.qty = Math.max(1, it.qty-1); saveCart(c); renderCart(); }
      });
    });
  }
  renderCart();

  // Add to cart from buttons with data attributes
  document.querySelectorAll('.add-to-cart').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const title = btn.dataset.title;
      const price = btn.dataset.price;
      const image = btn.dataset.image;
      const c = getCart();
      const existing = c.find(x=>x.id===id);
      if(existing) existing.qty += 1; else c.push({id,title,price,image,qty:1});
      saveCart(c);
      renderCart();
      const original = btn.textContent;
      btn.textContent = 'Added ✓';
      setTimeout(()=> btn.textContent = original, 900);
    });
  });

  // For product detail "Add to cart"
  document.querySelectorAll('.detail-add-to-cart').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const title = btn.dataset.title;
      const price = btn.dataset.price;
      const image = btn.dataset.image;
      const c = getCart();
      const existing = c.find(x=>x.id===id);
      if(existing) existing.qty += 1; else c.push({id,title,price,image,qty:1});
      saveCart(c);
      renderCart();
      const original = btn.textContent;
      btn.textContent = 'Added ✓';
      setTimeout(()=> btn.textContent = original, 900);
    });
  });

  // ---------------------------
  // Chat widget - toggle and send to /api/chat (server proxy)
  // ---------------------------
  const chatToggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const closeBtn = document.getElementById('chat-close');
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');

  if (chatToggle) {
    chatToggle.addEventListener('click', ()=>{
      if (chatWindow) chatWindow.classList.toggle('hidden');
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', ()=> chatWindow.classList.add('hidden'));
  }

  function appendMessage(text, cls){
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  // initial welcome
  setTimeout(()=> appendMessage("Hello! I'm JNG Assist — how can I help you today?", 'bot'), 350);

  async function sendMessage(){
    if (!input) return;
    const val = input.value.trim();
    if(!val) return;
    appendMessage(val, 'user');
    input.value = '';
    appendMessage('...', 'bot');
    try{
      // call backend proxy at /api/chat
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({message: val})
      });
      const data = await res.json();
      // replace last '...' with real reply
      const botMsgs = Array.from(messages.querySelectorAll('.msg.bot'));
      const last = botMsgs[botMsgs.length-1];
      if(last) last.textContent = data.reply || 'Sorry, no response';
      else appendMessage(data.reply || 'Sorry, no response', 'bot');
    }catch(e){
      appendMessage('Sorry — chat service is unavailable.', 'bot');
    }
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (input) input.addEventListener('keydown', function(e){ if(e.key==='Enter') sendMessage(); });

  // ---------------------------
  // Stripe Checkout (client) - Checkout button on cart page
  // ---------------------------
  const stripeCheckoutBtn = document.getElementById('stripe-checkout-btn');
  if (stripeCheckoutBtn) {
    stripeCheckoutBtn.addEventListener('click', async function(){
      const cart = getCart();
      if (!cart || cart.length === 0) {
        alert('Your cart is empty.');
        return;
      }
      // send cart to server to create Stripe Checkout Session
      try {
        const res = await fetch('/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({cart})
        });
        const data = await res.json();
        if (data && data.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
        } else {
          alert('Checkout failed. See console for details.');
          console.error(data);
        }
      } catch (err) {
        console.error(err);
        alert('Checkout request failed.');
      }
    });
  }

});
