function positionMenu(trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = rect.left + 'px';
  menu.style.width = rect.width + 'px';
}

export function initCustomSelects() {
  const selects = document.querySelectorAll('.custom-select-wrap');

  selects.forEach((selectEl) => {
    const trigger = selectEl.querySelector('.custom-select-trigger');
    const menu = selectEl.querySelector('.custom-select-menu');
    const options = selectEl.querySelectorAll('.custom-select-option');
    const text = selectEl.querySelector('.custom-select-text');

    if (!trigger || !menu || !options.length) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      selects.forEach((s) => {
        if (s !== selectEl) {
          s.classList.remove('open');
          const m = s.querySelector('.custom-select-menu');
          if (m) m.style.display = 'none';
        }
      });
      selectEl.classList.toggle('open');
      if (selectEl.classList.contains('open')) {
        positionMenu(trigger, menu);
        menu.style.display = 'block';
      } else {
        menu.style.display = 'none';
      }
    });

    options.forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        text.textContent = option.textContent;
        selectEl.dataset.value = value;

        options.forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        selectEl.classList.remove('open');
        menu.style.display = 'none';
      });
    });
  });

  document.addEventListener('click', () => {
    selects.forEach((s) => {
      s.classList.remove('open');
      s.querySelector('.custom-select-menu').style.display = 'none';
    });
  });
}

export function getSelectValue(selectId) {
  const selectEl = document.getElementById(selectId);
  return selectEl ? selectEl.dataset.value || '' : '';
}

export function setSelectOptions(selectId, options) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  const menu = selectEl.querySelector('.custom-select-menu');
  if (!menu) return;

  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  menu.innerHTML = options
    .map(
      (opt) =>
        `<div class="custom-select-option" data-value="${escapeHtml(String(opt.value))}">${escapeHtml(String(opt.label))}</div>`,
    )
    .join('');

  const newOptions = selectEl.querySelectorAll('.custom-select-option');
  newOptions.forEach((option) => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      const text = selectEl.querySelector('.custom-select-text');
      text.textContent = option.textContent;
      selectEl.dataset.value = value;

      newOptions.forEach((o) => o.classList.remove('selected'));
      option.classList.add('selected');

      selectEl.classList.remove('open');
      menu.style.display = 'none';
    });
  });
}

export function clearCustomSelects() {
  const selects = document.querySelectorAll('.custom-select-wrap');
  selects.forEach((selectEl) => {
    const firstOption = selectEl.querySelector('.custom-select-option');
    const options = selectEl.querySelectorAll('.custom-select-option');
    const text = selectEl.querySelector('.custom-select-text');

    if (firstOption) {
      text.textContent = firstOption.textContent;
      selectEl.dataset.value = firstOption.dataset.value || '';

      options.forEach((o) => o.classList.remove('selected'));
      firstOption.classList.add('selected');
    }

    selectEl.classList.remove('open');
    selectEl.querySelector('.custom-select-menu').style.display = 'none';
  });
}
