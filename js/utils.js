window.AppUtils={
 normalizarTexto:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),
 gerarId:(p='id')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
 formatarDataBR:d=>d?d.split('-').reverse().join('/'):'-',
 calcularMesReferencia:d=>d?d.slice(0,7):'',
 escapeHtml:s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),
 validarSenhaAdmin:()=>prompt('Digite a senha ADM:')===window.AppConstants.ADMIN_PASSWORD
};
