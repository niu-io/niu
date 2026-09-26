const rows = document.querySelector('[data-model-rows]');
const count = document.querySelector('[data-model-count]');
const statusMessage = document.querySelector('[data-catalog-status]');

function renderCapability(enabled, label) {
  if (!enabled) return null;
  const item = document.createElement('span');
  item.className = 'catalog-capability';
  item.textContent = label;
  return item;
}

function showEmpty(message) {
  rows.replaceChildren();
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 3;
  cell.className = 'catalog-empty';
  cell.textContent = message;
  row.append(cell);
  rows.append(row);
  count.textContent = '0 routes';
}

async function loadCatalog() {
  try {
    const response = await fetch('/catalog/v1/models', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.data)) throw new Error('Catalog response is invalid');
    if (catalog.data.length === 0) {
      showEmpty('No routes are published for public listing.');
      statusMessage.textContent = 'The gateway operator can publish aliases with the public_catalog setting.';
      return;
    }

    rows.replaceChildren();
    for (const model of catalog.data) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = model.id;
      const capabilityCell = document.createElement('td');
      capabilityCell.className = 'capability-list';
      const capabilities = model.capabilities ?? {};
      for (const item of [
        renderCapability(capabilities.chat_completions, 'Chat completions'),
        renderCapability(capabilities.streaming, 'Streaming'),
        renderCapability(capabilities.embeddings, 'Embeddings'),
        renderCapability(capabilities.responses, 'Responses'),
      ]) if (item) capabilityCell.append(item);
      const actionCell = document.createElement('td');
      actionCell.className = 'catalog-action';
      const link = document.createElement('a');
      link.href = '/docs/reference/api/';
      link.textContent = 'API reference';
      actionCell.append(link);
      row.append(name, capabilityCell, actionCell);
      rows.append(row);
    }
    count.textContent = `${catalog.data.length} ${catalog.data.length === 1 ? 'route' : 'routes'}`;
    statusMessage.textContent = 'Use your Niu workspace key to call a route enabled for your project.';
  } catch {
    showEmpty('The public catalog could not be loaded.');
    statusMessage.textContent = 'Check that this Niu gateway is ready, then reload the page.';
  }
}

void loadCatalog();
