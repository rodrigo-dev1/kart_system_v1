window.CampeonatosUI = {
  async listar() {
    const box = document.getElementById('listaCampeonatos');
    try { AppUtils.showLoading('Carregando campeonatos...'); const items = await FirestoreService.listDocuments('campeonatos', 'nome'); box.innerHTML = items.length ? items.map(c => `<div class='form-card'><b>${c.nome}</b><br><span class='muted'>${c.ano || '-'} • ${c.status || '-'}</span></div>`).join('') : `<p class='empty-state'>Nenhum campeonato cadastrado ainda.</p>`; }
    catch (e) { box.innerHTML = `<p class='form-error' style='display:block'>Erro ao carregar dados. Verifique as regras do Firestore ou a configuração do Firebase.</p>`; }
    finally { AppUtils.hideLoading(); }
  },
  async salvar(btn) {
    AppUtils.clearFormError('erroCampeonato');
    const senha = document.getElementById('campSenha').value;
    if (!AppUtils.validarSenhaAdmin(senha)) return AppUtils.showFormError('erroCampeonato', 'Senha ADM inválida.');
    if (!campNome.value || !campAno.value) return AppUtils.showFormError('erroCampeonato', 'Preencha Nome e Ano.');
    const id = campId.value || AppUtils.gerarId('camp');
    const dados = { id, nome: campNome.value.trim(), descricao: campDesc.value.trim(), ano: Number(campAno.value), status: campStatus.value, totalEtapas: Number(campEtapas.value || 7), dataInicio: campInicio.value, dataFim: campFim.value, pontuacao: AppConstants.PONTUACAO_PADRAO, pontosPole: Number(campPole.value || 1), pontosMelhorVolta: Number(campMv.value || 1), criadoEm: FirestoreService.serverTimestamp() };
    try { AppUtils.showLoading('Salvando campeonato...'); AppUtils.setButtonLoading(btn, true, 'Salvando...', 'Salvar campeonato'); await FirestoreService.setDocument('campeonatos', id, dados, true); AppUtils.showToast('Campeonato salvo com sucesso!', 'success'); await this.listar(); }
    catch (e) { AppUtils.showFormError('erroCampeonato', e.message); AppUtils.showToast(`Erro ao salvar campeonato: ${e.message}`, 'error'); }
    finally { AppUtils.hideLoading(); AppUtils.setButtonLoading(btn, false, 'Salvando...', 'Salvar campeonato'); }
  }
};
