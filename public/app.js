'use strict';

const API_BASE = '/api';

const elements = {
  loginPanel: document.querySelector('#login-panel'),
  loginForm: document.querySelector('#login-form'),
  email: document.querySelector('#email'),
  password: document.querySelector('#password'),
  loginButton: document.querySelector('#login-button'),
  loginError: document.querySelector('#login-error'),
  workspace: document.querySelector('#workspace'),
  accountLabel: document.querySelector('#account-label'),
  logout: document.querySelector('#logout-button'),
  pageTitle: document.querySelector('#page-title'),
  pageDescription: document.querySelector('#page-description'),
  composePanel: document.querySelector('#compose-panel'),
  messageForm: document.querySelector('#message-form'),
  messageBody: document.querySelector('#message-body'),
  batchMessages: document.querySelector('#batch-messages'),
  addMessageButton: document.querySelector('#add-message-button'),
  batchCount: document.querySelector('#batch-count'),
  batchCharacterCount: document.querySelector('#batch-character-count'),
  characterCount: document.querySelector('#character-count'),
  sendButton: document.querySelector('#send-button'),
  submitFeedback: document.querySelector('#submit-feedback'),
  refresh: document.querySelector('#refresh-button'),
  pageSize: document.querySelector('#page-size'),
  tableHead: document.querySelector('#table-head-row'),
  rows: document.querySelector('#message-rows'),
  resultCount: document.querySelector('#result-count'),
  tableError: document.querySelector('#table-error'),
  pageInfo: document.querySelector('#page-info'),
  previous: document.querySelector('#previous-button'),
  next: document.querySelector('#next-button'),
  dialog: document.querySelector('#review-dialog'),
  closeDialog: document.querySelector('#close-dialog'),
  reviewSender: document.querySelector('#review-sender'),
  reviewOriginal: document.querySelector('#review-original'),
  reviewDraft: document.querySelector('#review-draft'),
  reviewError: document.querySelector('#review-error'),
  approve: document.querySelector('#approve-button'),
  reject: document.querySelector('#reject-button'),
  regenerate: document.querySelector('#regenerate-button'),
};

const appStrings = {
  failed: "FAILED",
  pending: "PENDING",
  draft: "DRAFT",
  processing: "PROCESSING",
  approved: "APPROVED",
  rejected: "REJECTED",
  admin: "admin",
  candidate: "candidate",
};

const state = {
  token: null,
  user: null,
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  items: [],
  selectedMessage: null,
  loading: false,
  reviewing: false,
  batchMessagesData: [''],
};

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});

  headers.set('Accept', 'application/json');

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response (${response.status}).`);
    }
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || `Request failed (${response.status}).`;

    if (response.status === 401 && state.token) {
      signOut();
    }

    throw new Error(message);
  }

  return data;
}

function showMessage(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('alert-error', isError);
  setTimeout(() => {
    element.hidden = true;
  }, 3000);
}

function makeElement(tag, text, className) {
  const element = document.createElement(tag);

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  if (className) {
    element.className = className;
  }

  return element;
}

function makeButton(text, className, handler) {
  const button = makeElement('button', text, `button ${className}`);

  button.type = 'button';
  button.addEventListener('click', handler);

  return button;
}

function statusLabel(status) {
  return String(status || 'UNKNOWN')
    .toLowerCase()
    .replaceAll('_', ' ');
}

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();

  return makeElement(
    'span',
    statusLabel(status),
    `badge status-${normalized}`,
  );
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function updateTableColumns() {
  elements.tableHead.replaceChildren();

  const columns = [];

  if (state.user?.role === appStrings.admin) {
    columns.push('Sender');
  }

  columns.push('Message', 'Intent', 'Status', 'Created', 'Action');

  columns.forEach((label) => {
    elements.tableHead.append(makeElement('th', label));
  });
}

function renderRows() {
  elements.rows.replaceChildren();

  if (state.items.length === 0) {
    const row = makeElement('tr');
    const cell = makeElement(
      'td',
      state.total === 0 ? 'No messages found.' : 'No messages on this page.',
      'table-placeholder',
    );

    cell.colSpan = state.user?.role === appStrings.admin ? 6 : 5;
    row.append(cell);
    elements.rows.append(row);
  }

  state.items.forEach((message) => {
    const row = makeElement('tr');

    if (state.user?.role === appStrings.admin) {
      row.append(makeElement('td', message.sender || '—'));
    }

    const messageCell = makeElement('td', undefined, 'message-cell');
    messageCell.append(
      makeElement('div', message.body, 'message-preview'),
    );
    row.append(messageCell);

    row.append(makeElement('td', message.intent || 'Unclassified'));
    row.append(makeElement('td'));
    row.lastElementChild.append(statusBadge(message.status));
    row.append(makeElement('td', formatDate(message.createdAt)));

    const actionCell = makeElement('td');

    if ((state.user?.role === appStrings.admin && message.status === appStrings.draft) || message.status === appStrings.failed) {
      actionCell.append(
        makeButton('Review', 'button-primary', () => openReview(message)),
      );
    } else {
      actionCell.append(makeElement('span', '🚫', 'muted not-allowed-cursor'));
    }

    row.append(actionCell);
    elements.rows.append(row);
  });

  elements.resultCount.textContent =
    `${state.total} message${state.total === 1 ? '' : 's'} found`;

  elements.pageInfo.textContent =
    `Page ${state.page} of ${Math.max(1, state.totalPages)}`;

  elements.previous.disabled = state.loading || state.page <= 1;
  elements.next.disabled =
    state.loading ||
    state.totalPages === 0 ||
    state.page >= state.totalPages;

  elements.refresh.disabled = state.loading;
  elements.pageSize.disabled = state.loading;
}

function updateBatchUI() {
  elements.batchMessages.replaceChildren();
  let totalChars = 0;

  state.batchMessagesData.forEach((msg, index) => {
    totalChars += msg.length;
    const container = makeElement('div', undefined, 'batch-message');

    const header = makeElement('div', undefined, 'batch-message-header');
    header.append(makeElement('h3', `Message ${index + 1}`, 'batch-message-title'));

    if (state.batchMessagesData.length > 1) {
      const removeBtn = makeButton('Remove', 'button-light', () => {
        state.batchMessagesData.splice(index, 1);
        updateBatchUI();
        elements.messageBody = document.querySelector('#message-body');
      });
      header.append(removeBtn);
    }
    container.append(header);

    const textarea = makeElement('textarea');
    if (index === 0) {
      textarea.id = 'message-body';
    } else {
      textarea.id = `message-body-${index}`;
    }
    textarea.placeholder = 'Type your message here... (max 500 characters)';
    textarea.maxLength = 500;
    textarea.value = msg;
    textarea.addEventListener('input', (event) => {
      state.batchMessagesData[index] = event.target.value;
      updateBatchUI();
      elements.messageBody = document.querySelector('#message-body');
    });
    container.append(textarea);

    const footer = makeElement('div', undefined, 'message-editor-footer');
    footer.append(makeElement('span', `${msg.length} / 500 characters`, 'muted'));
    container.append(footer);

    elements.batchMessages.append(container);
  });

  elements.batchCount.textContent = `${state.batchMessagesData.length} / 5 messages`;
  elements.batchCharacterCount.textContent = `${totalChars} characters total`;
  elements.addMessageButton.disabled = state.batchMessagesData.length >= 5;
  elements.messageBody = document.querySelector('#message-body');
}

async function loadMessages() {
  if (!state.token || state.loading) {
    return;
  }

  state.loading = true;
  showMessage(elements.tableError, '');
  renderRows();

  const query = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
  });

  try {
    const result = await apiRequest(
      `/inbox/messages?${query.toString()}`,
    );

    if (
      !result ||
      !Array.isArray(result.items) ||
      !Number.isInteger(result.total)
    ) {
      throw new Error('The API returned an invalid pagination response.');
    }

    state.items = result.items;
    state.total = result.total;
    state.page = result.page;
    state.limit = result.limit;
    state.totalPages = result.totalPages;

    if (state.totalPages > 0 && state.page > state.totalPages) {
      state.page = state.totalPages;
      state.loading = false;
      await loadMessages();
      return;
    }

    updateTableColumns();
    renderRows();
  } catch (error) {
    showMessage(elements.tableError, error.message, true);
  } finally {
    state.loading = false;
    renderRows();
  }
}

async function signIn(event) {
  event.preventDefault();
  showMessage(elements.loginError, '');

  elements.loginButton.disabled = true;

  try {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: elements.email.value.trim(),
        password: elements.password.value,
      }),
    });

    if (
      !result?.accessToken ||
      !result.user?.email ||
      ![appStrings.admin, appStrings.candidate].includes(result.user.role)
    ) {
      throw new Error('The server returned an invalid login response.');
    }

    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));

    setLoginVisibility({
      showWorkspace: true,
      showLogout: true,
      accountLabelText: result.user.email,
      showLogin: false,
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    showMessage(elements.loginError, error.message, true);
  } finally {
    elements.loginButton.disabled = false;
  }
}

function signOut() {
  state.token = null;
  state.user = null;
  state.items = [];
  state.total = 0;
  state.page = 1;
  state.totalPages = 0;
  state.selectedMessage = null;

  if (elements.dialog.open) {
    elements.dialog.close();
  }

  elements.loginForm.reset();
  elements.messageForm.reset();
  state.batchMessagesData = [''];
  updateBatchUI();
  elements.messageBody = document.querySelector('#message-body');

  setLoginVisibility({
    showWorkspace: false,
    showLogout: false,
    accountLabelText: '',
    showLogin: true,
  });

  showMessage(elements.loginError, '');
  showMessage(elements.tableError, '');
  elements.email.focus();
  clearLocalStorage();
}

async function setLoginVisibility({
  showLogin = true,
  showWorkspace = false,
  showLogout = false,
  accountLabelText = '',
  user,
  accessToken,
}) {
  elements.loginPanel.hidden = !showLogin;
  elements.workspace.hidden = !showWorkspace;
  elements.logout.hidden = !showLogout;
  elements.accountLabel.textContent = accountLabelText;
  if (user) {
    state.token = accessToken;
    state.user = user;
    state.page = 1;

    elements.pageTitle.textContent = user.role === appStrings.admin ? 'All candidate messages' : 'My messages';

    elements.pageDescription.textContent =
      user.role === appStrings.admin
        ? 'Review AI-generated drafts from all candidates.'
        : 'Submit messages and track your replies.';

    elements.composePanel.hidden = user.role !== appStrings.candidate;
    if (user.role === appStrings.candidate) {
      updateBatchUI();
      elements.messageBody = document.querySelector('#message-body');
    }

    updateTableColumns();
    await loadMessages();
  }
}

async function submitBatch(event) {
  event.preventDefault();

  const candidateEmail = state.user?.email || elements.email.value.trim();
  const messages = state.batchMessagesData
    .map((body) => ({ sender: candidateEmail, body: body.trim() }))
    .filter((m) => m.body.length > 0);

  if (messages.length === 0) {
    showMessage(
      elements.submitFeedback,
      'Please enter at least one message before submitting.',
      true,
    );
    return;
  }

  elements.sendButton.disabled = true;
  showMessage(elements.submitFeedback, '');

  try {
    await apiRequest('/inbox/messages/batch', {
      method: 'POST',
      body: JSON.stringify({
        key: `batch-${Date.now()}`,
        messages,
      }),
    });

    state.batchMessagesData = [''];
    updateBatchUI();
    elements.messageBody = document.querySelector('#message-body');

    showMessage(
      elements.submitFeedback,
      'Message batch submitted successfully.',
    );

    state.page = 1;
    await loadMessages();
  } catch (error) {
    showMessage(elements.submitFeedback, error.message, true);
  } finally {
    elements.sendButton.disabled = false;
  }
}

function openReview(message) {
  if (state.user?.role !== appStrings.admin) {
    return;
  }

  state.selectedMessage = message;
  showMessage(elements.reviewError, '');

  elements.reviewSender.textContent = message.sender;
  elements.reviewOriginal.textContent = message.body;
  elements.reviewDraft.textContent = message.draft || 'No draft available.';

  const canReview = (message.status === appStrings.draft && Boolean(message.draft) || message.status === appStrings.failed);

  elements.approve.hidden = !canReview;
  elements.reject.hidden = !canReview;
  elements.regenerate.hidden = !canReview;
  elements.dialog.showModal();
}

async function reviewMessage(action) {
  const message = state.selectedMessage;

  if (
    state.user?.role !== appStrings.admin ||
    !message ||
    message.status !== appStrings.draft ||
    state.reviewing
  ) {
    return;
  }

  state.reviewing = true;
  elements.approve.disabled = true;
  elements.reject.disabled = true;
  elements.regenerate.disabled = true;
  showMessage(elements.reviewError, '');

  try {
    await apiRequest(
      `/inbox/messages/${encodeURIComponent(message.id)}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({ version: message.version }),
      },
    );

    elements.dialog.close();
    state.selectedMessage = null;

    let customMessage = '';
    switch (action) {
      case 'reject':
        customMessage = 'Message reject successfully';
        break;
      case 'approved':
        customMessage = 'Message approved successfully';
        break;
      case 'regenerate':
        customMessage = 'Response regeneration request successful';
        break;
      default:
        customMessage = 'Invalid action provided.';
        break;
    }

    showMessage(elements.tableError, customMessage);

    await loadMessages();
  } catch (error) {
    showMessage(elements.reviewError, error.message, true);

    if (error.message.toLowerCase().includes('changed')) {
      await loadMessages();
    }
  } finally {
    state.reviewing = false;
    elements.approve.disabled = false;
    elements.reject.disabled = false;
    elements.regenerate.disabled = false;
  }
}

async function regenerateResponse() {
  const message = state.selectedMessage;

  if (
    state.user?.role !== appStrings.admin ||
    !message ||
    (message.status !== appStrings.draft && message.status !== appStrings.failed) ||
    state.reviewing
  ) {
    return;
  }

  state.reviewing = true;
  elements.approve.disabled = true;
  elements.reject.disabled = true;
  elements.regenerate.disabled = true;
  showMessage(elements.reviewError, '');

  try {
    await apiRequest(
      `/inbox/messages/${encodeURIComponent(message.id)}/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify({ version: message.version }),
      },
    );

    elements.dialog.close();
    state.selectedMessage = null;

    let customMessage = 'Response regeneration request successful';

    showMessage(elements.tableError, customMessage);

    await loadMessages();
  } catch (error) {
    showMessage(elements.reviewError, error.message, true);

    if (error.message.toLowerCase().includes('changed')) {
      await loadMessages();
    }
  } finally {
    state.reviewing = false;
    elements.approve.disabled = false;
    elements.reject.disabled = false;
    elements.regenerate.disabled = false;
  }
}

function fetchLoginUser() {
  return JSON.parse(localStorage.getItem('user') || 'null');
}

function fetchLoginUserAccessToken() {
  return localStorage.getItem('accessToken');
}

function clearLocalStorage() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

async function isLoggedIn() {
  const user = fetchLoginUser();
  const accessToken = fetchLoginUserAccessToken();
  if (!user || !accessToken) {
    clearLocalStorage();
    setLoginVisibility({
      showWorkspace: false,
      showLogout: false,
      accountLabelText: '',
      showLogin: true,
    });
  } else {
    setLoginVisibility({
      showWorkspace: true,
      showLogout: true,
      accountLabelText: user.email,
      showLogin: false,
      user,
      accessToken,
    });
  }
}

isLoggedIn();
elements.loginForm.addEventListener('submit', signIn);
elements.logout.addEventListener('click', signOut);
elements.messageForm.addEventListener('submit', submitBatch);

elements.addMessageButton.addEventListener('click', () => {
  if (state.batchMessagesData.length < 5) {
    state.batchMessagesData.push('');
    updateBatchUI();
    elements.messageBody = document.querySelector('#message-body');
  }
});

elements.refresh.addEventListener('click', () => {
  loadMessages();
});

elements.previous.addEventListener('click', async () => {
  if (state.page > 1 && !state.loading) {
    state.page -= 1;
    await loadMessages();
  }
});

elements.next.addEventListener('click', async () => {
  if (state.page < state.totalPages && !state.loading) {
    state.page += 1;
    await loadMessages();
  }
});

elements.pageSize.addEventListener('change', async () => {
  state.limit = Number(elements.pageSize.value);
  state.page = 1;
  await loadMessages();
});

elements.closeDialog.addEventListener('click', () => {
  elements.dialog.close();
});

elements.approve.addEventListener('click', () => {
  reviewMessage('approve');
});

elements.reject.addEventListener('click', () => {
  reviewMessage('reject');
});

elements.regenerate.addEventListener('click', () => {
  regenerateResponse();
});

elements.dialog.addEventListener('close', () => {
  state.selectedMessage = null;
});