window.AppUtils = {
  normalizarTexto: (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
  gerarId: (p = 'id') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  calcularMesReferencia: (d) => (d || '').slice(0, 7),
  validarSenhaAdmin: (senha) => senha === window.AppConstants.ADMIN_PASSWORD,
  showLoading(msg = 'Carregando...') { const o = document.getElementById('loadingOverlay'); if (!o) return; o.style.display = 'flex'; o.querySelector('.loading-box').textContent = msg; },
  hideLoading() { const o = document.getElementById('loadingOverlay'); if (o) o.style.display = 'none'; },
  showToast(msg, tipo = 'info') { const c = document.getElementById('toastContainer'); if (!c) return; const t = document.createElement('div'); t.className = `toast ${tipo}`; t.textContent = msg; c.appendChild(t); setTimeout(() => t.remove(), 4000); },
  setButtonLoading(btn, loading, txtLoading, txtOriginal) { if (!btn) return; if (!btn.dataset.originalText) btn.dataset.originalText = txtOriginal || btn.textContent; btn.disabled = loading; btn.textContent = loading ? txtLoading : (txtOriginal || btn.dataset.originalText); },
  showFormError(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.display = 'block'; } },
  clearFormError(id) { const el = document.getElementById(id); if (el) { el.textContent = ''; el.style.display = 'none'; } }
};
