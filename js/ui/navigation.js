window.NavigationUI={show(id){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.getElementById(id)?.classList.add('active');}};
window.showSection=NavigationUI.show;
