function escGuideHtml(s){
  var d=document.createElement('div');
  d.textContent=s==null?'':String(s);
  return d.innerHTML;
}
async function askAsyaGuide(){
  var input=document.getElementById('asya-guide-input');
  var msg=document.getElementById('asya-guide-msg');
  var btn=document.getElementById('asya-guide-send');
  if(btn.disabled) return; // already sending — ignore a repeat Enter/click
  var text=input.value.trim();
  if(!text) return;
  input.value='';
  btn.disabled=true;
  msg.textContent='Thinking...';
  var sys=window._GUIDE_SYSTEM_PROMPT||'You are Asya, the ComplaintCA assistant. Answer the user\'s question about filing a complaint in Canada concisely, in 2-3 sentences, no preamble.';
  try{
    var out;
    try{
      var r=await fetch('/api/groq-proxy',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'llama-3.1-8b-instant',
          max_tokens:220,
          messages:[{role:'system',content:sys},{role:'user',content:text}]
        })
      });
      var d=await r.json();
      if(d.error||!d.choices) throw new Error('groq failed');
      out=(d.choices[0].message.content||'').trim();
    }catch(e0){
      var r2=await fetch('/api/claude-proxy',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          max_tokens:220,
          system:sys,
          messages:[{role:'user',content:text}]
        })
      });
      var d2=await r2.json();
      if(d2.error) throw new Error(d2.error.message||'error');
      out=(d2.content||[]).map(function(c){return c.text||'';}).join('').trim();
    }
    var startUrl='https://www.complaintca.ca/?d='+encodeURIComponent(text);
    msg.innerHTML=escGuideHtml(out||"I couldn't find a clear answer — try ComplaintCA directly, it'll ask the right questions.")+
      '<br><br><a href="'+startUrl+'" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600">Start This Complaint Now →</a>';
  }catch(e){
    msg.innerHTML='Asya is unavailable right now. <a href="https://www.complaintca.ca" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600">Continue on ComplaintCA →</a>';
  }finally{
    btn.disabled=false;
  }
}
