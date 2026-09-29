// ---------- ГЛОБАЛЬНАЯ ПРОВЕРКА АВТОРИЗАЦИИ ----------
(function() {
  var token = localStorage.getItem('iskra_token');
  var name = localStorage.getItem('iskra_name');
  var login = localStorage.getItem('iskra_login');

  // Если нет токена или имени — редирект на вход
  if (!token || !name) {
    // Не редиректим, если уже на login.html
    if (window.location.pathname.indexOf('login.html') === -1) {
      window.location.href = '/login.html';
    }
    return;
  }

  // Делаем имя глобально доступным
  window.myName = name;
  window.myLogin = login;
  window.myToken = token;

  // Проверяем валидность токена через сокет (если socket.io подключён)
  if (typeof io === 'function') {
    var checkSocket = io();
    var checked = false;

    checkSocket.on('connect', function() {
      checkSocket.emit('check_session', { token: token });
    });

    checkSocket.on('session_valid', function(data) {
      if (checked) return;
      checked = true;
      // Обновляем данные на случай, если имя изменилось
      localStorage.setItem('iskra_name', data.displayName);
      localStorage.setItem('iskra_login', data.login);
      window.myName = data.displayName;
      window.myLogin = data.login;
      checkSocket.disconnect();
    });

    checkSocket.on('session_invalid', function() {
      if (checked) return;
      checked = true;
      checkSocket.disconnect();
      // Токен протух — чистим и на вход
      localStorage.removeItem('iskra_token');
      localStorage.removeItem('iskra_login');
      localStorage.removeItem('iskra_name');
      if (window.location.pathname.indexOf('login.html') === -1) {
        window.location.href = '/login.html';
      }
    });

    // Страховка: если сервер молчит 5 секунд — не блокируем
    setTimeout(function() {
      if (checked) return;
      checked = true;
      checkSocket.disconnect();
    }, 5000);
  }
})();