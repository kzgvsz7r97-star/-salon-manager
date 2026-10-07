(() => {
  if (window.__bookingCurrentMonthV1) return;
  window.__bookingCurrentMonthV1 = true;

  function monthRange() {
    const now = new Date();
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const end = localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { start, end };
  }

  function setCurrentMonthIfBlank() {
    const from = document.getElementById('bookingFilterFrom');
    const to = document.getElementById('bookingFilterTo');
    if (!from || !to) return;
    if (!from.value && !to.value) {
      const range = monthRange();
      from.value = range.start;
      to.value = range.end;
    }
  }

  const originalRenderBookings = renderBookings;
  renderBookings = function () {
    setCurrentMonthIfBlank();
    return originalRenderBookings();
  };

  resetBookingFilters = function () {
    if ($('bookingFilterName')) $('bookingFilterName').value = '';

    const range = monthRange();
    if ($('bookingFilterFrom')) $('bookingFilterFrom').value = range.start;
    if ($('bookingFilterTo')) $('bookingFilterTo').value = range.end;

    [
      'bookingFilterSource',
      'bookingFilterType',
      'bookingFilterBookingType',
      'bookingFilterStaff',
      'bookingFilterStatus',
      'bookingFilterPayment',
      'bookingFilterNext'
    ].forEach(id => {
      if ($(id)) $(id).value = '';
    });

    renderBookings();
  };

  setCurrentMonthIfBlank();
  renderBookings();
})();
