/* CAA Apartment Investor Tools — shared engine for the Owner's Toolkit pages.
   Each page calls CAA.tool({...}) with its fields and a compute(values) function.
   Mortgage math uses Canadian semi-annual compounding throughout. */
(function(){
"use strict";

/* ---------- the toolkit registry (drives "Related tools" on every page) ---------- */
var TOOLS=[
  {href:"building-value.html",   name:"Building Value Estimator", q:"What's it worth?"},
  {href:"cash-flow.html",        name:"Cash Flow Calculator",     q:"What does it earn?"},
  {href:"mortgage-calculator.html",name:"Commercial Mortgage Calculator", q:"What's the payment?"},
  {href:"loan-sizing.html",      name:"Maximum Loan Sizing",      q:"How much will they lend?"},
  {href:"cmhc-premium.html",     name:"CMHC Premium Calculator",  q:"What does insurance cost?"},
  {href:"mli-select-points.html",name:"MLI Select Points Estimator", q:"Do I qualify?"},
  {href:"renovation-lift.html",  name:"Renovation Lift Calculator", q:"Is the upgrade worth it?"},
  {href:"sell-vs-refinance.html",name:"Sell vs. Refinance",       q:"Cash out or keep it?"},
  {href:"financing-comparator.html",name:"Deal Financing Comparator", q:"Which loan fits the deal?"}
];

/* ---------- formatting ---------- */
function fin(v){return typeof v==="number"&&isFinite(v)}
var money=function(v){return !fin(v)?"–":(v<0?"−$":"$")+Math.round(Math.abs(v)).toLocaleString("en-CA")};
var neg=function(v){return !fin(v)?"–":"("+money(Math.abs(v))+")"};
var pct=function(v,d){return !fin(v)?"–":(v*100).toFixed(d==null?2:d)+"%"};
var pts=function(v,d){return !fin(v)?"–":v.toFixed(d==null?2:d)+"%"};
var times=function(v){return !fin(v)?"n/a":v.toFixed(2)+"×"};
var yrs=function(v){return !fin(v)?"–":v.toFixed(1)+" yrs"};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};

/* ---------- Canadian mortgage math ---------- */
// Effective monthly rate for a nominal annual rate compounded semi-annually.
function mRate(ratePct){return Math.pow(1+ratePct/200,1/6)-1}
function payment(P,ratePct,amortYrs){
  var i=mRate(ratePct),n=amortYrs*12;
  if(!(P>0)||!(n>0))return 0;
  return i===0?P/n:P*i/(1-Math.pow(1+i,-n));
}
function balanceAfter(P,ratePct,amortYrs,months){
  var i=mRate(ratePct),n=amortYrs*12;
  if(!(P>0))return 0; if(months>=n)return 0;
  var p=payment(P,ratePct,amortYrs);
  if(i===0)return Math.max(P-p*months,0);
  var g=Math.pow(1+i,months); return Math.max(P*g-p*(g-1)/i,0);
}
// Largest loan whose annual debt service = NOI / DSCR floor.
function maxLoanFromNOI(noi,ratePct,amortYrs,dscr){
  if(!(noi>0)||!(dscr>0)||!(amortYrs>0))return 0;
  var i=mRate(ratePct),n=amortYrs*12,m=noi/dscr/12;
  return i===0?m*n:m*(1-Math.pow(1+i,-n))/i;
}

/* ---------- analytics (same GA property as the main site) ---------- */
function track(name,params){try{window.gtag&&window.gtag("event",name,params||{})}catch(e){}}

/* ---------- the page builder ---------- */
function tool(cfg){
  var fields=[];cfg.groups.forEach(function(g){g.fields.forEach(function(f){fields.push(f)})});
  fields.forEach(function(f){
    if(f.type==="select")return;
    if(f.min==null)f.min=/^(p|price|value|cap|dscr|cdscr|cam)$/.test(f.k)?0.000001:0;
    if(f.max==null&&(/^(ltv|cltv|vac|rate|prem|sc|rc|close)$/.test(f.k)))f.max=100;
    if(f.k==="cam"&&f.max==null)f.max=50;
  });
  var defaults={};fields.forEach(function(f){defaults[f.k]=f.def});
  var v=Object.assign({},defaults,readHash(fields));
  var $in=document.getElementById("inputs"),$out=document.getElementById("results");
  var base={tool:cfg.id};

  // inputs panel
  var h='<div class="panel-h"><h2>Your numbers</h2><span class="tag" id="stateTag">SAMPLE figures</span></div><div class="panel-b">';
  cfg.groups.forEach(function(g){
    if(g.title)h+='<div class="group-h">'+esc(g.title)+'</div>';
    if(g.note)h+='<div class="group-note">'+g.note+'</div>';
    var rowOpen=false;
    g.fields.forEach(function(f,idx){
      if(f.pair==="start"){h+='<div class="two">';rowOpen=true}
      h+=fieldHTML(f);
      if(f.pair==="end"&&rowOpen){h+='</div>';rowOpen=false}
    });
    if(rowOpen)h+='</div>';
  });
  h+='<div class="btns"><button class="btn" id="btnReset" type="button">Reload SAMPLE figures</button><button class="btn" id="btnShare" type="button">Copy link to these numbers</button><span class="btn-msg" id="btnMsg" aria-live="polite"></span></div>';
  h+='<p class="disclaimer">Your edited numbers appear in the address bar. Anyone with a copied link can read them. Only share figures you intend to disclose.</p>';
  h+='<p class="disclaimer">Pre-filled figures are SAMPLE placeholders, not data about any real building. Replace them with your own numbers.</p></div>';
  $in.innerHTML=h;

  fields.forEach(function(f){
    var el=document.getElementById("f-"+f.k);
    el.value=v[f.k];
    el.addEventListener("input",function(){v[f.k]=f.type==="select"?el.value:el.value;update(f.k)});
    el.addEventListener("change",function(){v[f.k]=el.value;update(f.k)});
  });
  document.getElementById("btnReset").addEventListener("click",function(){
    v=Object.assign({},defaults);fields.forEach(function(f){document.getElementById("f-"+f.k).value=v[f.k]});
    track("tool_reset",base);update();
  });
  document.getElementById("btnShare").addEventListener("click",function(){
    var url=location.href,msg=document.getElementById("btnMsg");
    var done=function(){msg.textContent="Link copied.";setTimeout(function(){msg.textContent=""},2500)};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(done,function(){msg.textContent="Copy the address bar."})}
    else msg.textContent="Copy the address bar.";
    track("tool_share_link",base);
  });

  var timer=null;
  function update(changedKey){
    if(render())writeHash();
    if(changedKey){clearTimeout(timer);timer=setTimeout(function(){track("tool_inputs_changed",Object.assign({field:changedKey},base))},1500)}
  }
  function nums(){var o={};fields.forEach(function(f){o[f.k]=f.type==="select"?v[f.k]:num(v[f.k])});return o}
  function render(){
    var errors=[];
    fields.forEach(function(f){
      var message=fieldError(f,v[f.k]);
      var el=document.getElementById("f-"+f.k);
      el.setCustomValidity(message);el.setAttribute("aria-invalid",message?"true":"false");
      if(message)errors.push(message);
    });
    document.getElementById("btnShare").disabled=errors.length>0;
    if(errors.length){
      $out.innerHTML='<div class="panel"><div class="banner" role="alert">'+errors.map(esc).join('<br>')+'</div></div>';
      return false;
    }
    var edited=fields.some(function(f){return String(v[f.k])!==String(defaults[f.k])});
    var tag=document.getElementById("stateTag");tag.textContent=edited?"Your numbers":"SAMPLE figures";tag.className="tag"+(edited?" edited":"");
    var r=cfg.compute(nums());
    var o='<div class="panel results-panel">';
    if(r.leaders&&r.leaders.length){
      o+='<div class="leaders">'+r.leaders.map(function(x){return '<div class="'+(x.tone||"")+'"><span class="caps">'+esc(x.label)+'</span><b>'+esc(x.value)+'</b>'+(x.sub?'<span class="caps" style="text-transform:none;letter-spacing:0">'+esc(x.sub)+'</span>':"")+'</div>'}).join("")+'</div>';
    }
    if(r.banner)o+='<div class="banner" style="margin:14px 18px 0">'+r.banner+'</div>';
    o+='<div class="ledger">'+(r.rows||[]).map(rowHTML).join("")+'</div>';
    if(r.extra)o+=r.extra;
    if(r.note)o+='<div class="note"><b>Underwriting note</b>'+r.note+'</div>';
    o+='</div>';
    $out.innerHTML=o;
    return true;
  }
  function writeHash(){
    var parts=[];fields.forEach(function(f){if(String(v[f.k])!==String(defaults[f.k]))parts.push(f.k+"="+encodeURIComponent(v[f.k]))});
    var h=parts.length?"#"+parts.join("&"):"";
    try{history.replaceState(null,"",location.pathname+location.search+h)}catch(e){}
  }

  renderRelated(cfg.page);
  render();
  track("tool_view",base);
  window.__caa=Object.assign(window.__caa||{},{compute:function(o){return cfg.compute(Object.assign(nums(),o||{}))}});
}

function fieldHTML(f){
  var id="f-"+f.k,h='<div class="field"><label for="'+id+'">'+esc(f.label)+'</label>';
  if(f.type==="select"){
    h+='<select id="'+id+'">'+f.options.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join("")+'</select>';
  }else{
    h+='<div class="inrow">'+(f.prefix?'<span>'+esc(f.prefix)+'</span>':"")+
      '<input id="'+id+'" type="number" inputmode="decimal" step="'+(f.step||"any")+'"'+(f.min!=null?' min="'+f.min+'"':"")+(f.max!=null?' max="'+f.max+'"':"")+'>'+
      (f.suffix?'<span>'+esc(f.suffix)+'</span>':"")+'</div>';
  }
  if(f.hint)h+='<div class="hint">'+f.hint+'</div>';
  return h+'</div>';
}
function rowHTML(r){
  if(r.h)return '<div class="row-head">'+esc(r.h)+'</div>';
  var cls="row"+(r.strong?" strong":"")+(r.sub?" sub":"");
  return '<div class="'+cls+'"><span class="l">'+esc(r.l)+'</span><span class="v'+(r.tone?" "+r.tone:"")+'">'+esc(r.v)+'</span></div>';
}
function renderRelated(current){
  var el=document.getElementById("related");if(!el)return;
  el.innerHTML='<span class="caps">More tools</span><ul>'+TOOLS.filter(function(t){return t.href!==current}).map(function(t){return '<li><a href="'+t.href+'">'+esc(t.name)+'</a></li>'}).join("")+'</ul>';
}
function num(x){return Number(x)}
function fieldError(f,value){
  if(f.type==="select")return f.options.some(function(o){return String(o[0])===String(value)})?"":f.label+": choose an available option.";
  var n=Number(value);
  if(String(value).trim()===""||!isFinite(n))return f.label+": enter a finite number.";
  if(f.min!=null&&n<f.min)return f.label+": enter at least "+f.min+".";
  if(f.max!=null&&n>f.max)return f.label+": enter no more than "+f.max+".";
  return "";
}
function readHash(fields){
  var o={},h=location.hash.replace(/^#/,"");if(!h)return o;
  var keys={};fields.forEach(function(f){keys[f.k]=f});
  h.split("&").forEach(function(p){var kv=p.split("=");var f=keys[kv[0]];if(!f||kv.length<2)return;
    var val;try{val=decodeURIComponent(kv[1])}catch(e){return}
    if(f.type==="select"){if(f.options.some(function(o){return String(o[0])===val}))o[f.k]=val}
    else o[f.k]=val;});
  return o;
}

window.CAA={tool:tool,TOOLS:TOOLS,track:track,
  m:{mRate:mRate,payment:payment,balanceAfter:balanceAfter,maxLoanFromNOI:maxLoanFromNOI},
  f:{money:money,neg:neg,pct:pct,pts:pts,times:times,yrs:yrs,esc:esc}};
})();
