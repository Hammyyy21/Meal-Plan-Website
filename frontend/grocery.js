(async function(){
  const list = document.getElementById('groceryItems');
  const error = document.getElementById('groceryError');
  const total = document.getElementById('groceryTotal');
  async function request(url, options={}){
    const res = await fetch(url,{credentials:'same-origin',...options});
    if(res.status===401){window.location.href='index.html';throw new Error('Please log in');}
    if(!res.ok){let detail='Request failed ('+res.status+')';try{const data=await res.json();if(typeof data.detail==='string')detail=data.detail;}catch{}throw new Error(detail);}
    return res.status===204?null:res.json();
  }
  function money(n){return '$'+Number(n).toFixed(2);}
  async function refresh(){
    try{
      const items=await request('/api/grocery-items');
      list.replaceChildren();
      if(!items.length){const li=document.createElement('li');li.textContent='No items yet. Add your first grocery item above.';list.append(li);}
      for(const item of items){
        const li=document.createElement('li');
        const label=document.createElement('label');
        const check=document.createElement('input');check.type='checkbox';check.checked=item.purchased;
        check.addEventListener('change',async()=>{try{await request('/api/grocery-items/'+item.item_id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({purchased:check.checked})});error.textContent='';await refresh();}catch(e){error.textContent=e.message;check.checked=!check.checked;}});
        const name=document.createElement('span');name.textContent=item.name+' — '+item.quantity+' '+item.unit;name.className=item.purchased?'done':'';
        label.append(check,name);
        const right=document.createElement('div');right.style.display='flex';right.style.gap='14px';right.style.alignItems='center';
        const price=document.createElement('span');price.className='grocery-meta';price.textContent=money(item.estimated_price);
        const del=document.createElement('button');del.className='grocery-remove';del.textContent='Remove';del.type='button';
        del.addEventListener('click',async()=>{try{await request('/api/grocery-items/'+item.item_id,{method:'DELETE'});error.textContent='';await refresh();}catch(e){error.textContent=e.message;}});
        right.append(price,del);li.append(label,right);list.append(li);
      }
      total.textContent='Estimated total: '+money(items.reduce((sum,item)=>sum+Number(item.estimated_price),0));
    }catch(e){error.textContent=e.message;}
  }
  document.getElementById('groceryForm').addEventListener('submit',async e=>{
    e.preventDefault();error.textContent='';
    const body={name:document.getElementById('itemName').value.trim(),quantity:Number(document.getElementById('itemQty').value),unit:document.getElementById('itemUnit').value.trim(),estimated_price:Number(document.getElementById('itemPrice').value)};
    try{await request('/api/grocery-items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});e.target.reset();document.getElementById('itemQty').value=1;document.getElementById('itemUnit').value='pcs';document.getElementById('itemPrice').value=0;await refresh();}catch(e){error.textContent=e.message;}
  });
  await refresh();
})();
