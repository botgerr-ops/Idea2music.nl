(() => {
  'use strict';
  let secret = '';
  const byId = id => document.getElementById(id);
  const euros = cents => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const when = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(date)
      : 'Onbekende datum';
  };
  const statusName = status => ({
    paid: 'Betaald', open: 'Open', pending: 'In behandeling', authorized: 'Gereserveerd',
    canceled: 'Geannuleerd', expired: 'Verlopen', failed: 'Mislukt',
  })[status] || 'Onbekend';

  function message(id, text) {
    byId(id).textContent = text;
    byId(id).hidden = !text;
  }

  function signOut(text = '') {
    secret = '';
    byId('admin-token').value = '';
    byId('dashboard-view').hidden = true;
    byId('login-view').hidden = false;
    byId('orders-list').replaceChildren();
    message('dashboard-message', '');
    message('login-message', text);
    byId('admin-token').focus();
  }

  function renderOrder(order) {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const ref = document.createElement('span');
    ref.className = 'order-id';
    ref.textContent = order.ref;
    const time = document.createElement('span');
    time.className = 'order-date';
    time.textContent = when(order.createdAt);
    details.append(ref, time);

    const status = document.createElement('span');
    const label = order.cancellationRequested ? 'Annulering gevraagd' : statusName(order.status);
    status.className = `pill ${order.cancellationRequested ? 'alert' : order.status === 'paid' ? 'paid' : ''}`;
    status.textContent = label;

    const amount = document.createElement('span');
    amount.className = 'order-price';
    amount.textContent = euros(order.amountCents);
    li.append(details, status, amount);
    return li;
  }

  function render(data) {
    byId('paid-amount').textContent = euros(data.totals.paidCents);
    byId('started-orders').textContent = data.totals.started.toLocaleString('nl-NL');
    byId('paid-orders').textContent = data.totals.paid.toLocaleString('nl-NL');
    byId('awaiting-orders').textContent = data.totals.awaiting.toLocaleString('nl-NL');
    byId('cancellation-orders').textContent = data.totals.cancellationRequests.toLocaleString('nl-NL');
    byId('test-warning').hidden = !data.testMode;
    byId('updated-at').textContent = `Bijgewerkt ${when(data.generatedAt)}`;
    byId('orders-list').replaceChildren(...data.recentOrders.map(renderOrder));
    byId('orders-empty').hidden = data.recentOrders.length > 0;
  }

  async function load() {
    const refresh = byId('refresh');
    refresh.disabled = true;
    message('dashboard-message', 'Gegevens ophalen…');
    try {
      const days = byId('period').value;
      const response = await fetch(`/api/admin/stats?days=${encodeURIComponent(days)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
      });
      const body = await response.json();
      if (response.status === 401) return signOut('Deze beheercode klopt niet. Probeer het opnieuw.');
      if (!response.ok) throw new Error(body.message || 'De cijfers zijn nu niet bereikbaar.');
      render(body);
      byId('login-view').hidden = true;
      byId('dashboard-view').hidden = false;
      message('login-message', '');
      message('dashboard-message', '');
    } catch (error) {
      const destination = byId('dashboard-view').hidden ? 'login-message' : 'dashboard-message';
      message(destination, error.message || 'De verbinding is niet beschikbaar.');
    } finally {
      refresh.disabled = false;
    }
  }

  byId('login-form').addEventListener('submit', event => {
    event.preventDefault();
    secret = byId('admin-token').value.trim();
    byId('admin-token').value = '';
    if (!secret) return message('login-message', 'Vul je beheercode in.');
    load();
  });
  byId('refresh').addEventListener('click', load);
  byId('period').addEventListener('change', load);
  byId('logout').addEventListener('click', () => signOut());
})();
