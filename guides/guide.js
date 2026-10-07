/* ComplaintCA — shared behaviour for /guides/*-guide.html pages. */
function openStep(id){
  document.querySelectorAll('.step-modal').forEach(function(m){m.style.display='none'});
  document.getElementById(id).style.display='block';
  document.getElementById('step-overlay').classList.add('show');
}
function closeStep(){
  document.getElementById('step-overlay').classList.remove('show');
}
function openInfo(){
  document.getElementById('info-overlay').classList.add('show');
}
function closeInfo(){
  document.getElementById('info-overlay').classList.remove('show');
}
