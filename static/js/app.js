/**
 * BridgeSCAP-BIM: Lógica del Cliente
 * Tesis: Propuesta de Mantenimiento Integral del Puente Sánchez Cerro - SCAP & BIM
 * Autor: Br. Christian Ivan Vilchez Tume
 */

let allComponents = [];
let currentComponent = null;

// Inicialización al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupPhotoDropzone();
  setupClipboardPaste();
  loadAllComponents();
  
  // Establecer fecha y hora actual en la ficha
  const now = new Date();
  const dateFormatted = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
  const dateInput = document.getElementById('f-datetime');
  if (dateInput) dateInput.value = dateFormatted;
  
  const printTs = document.getElementById('print-timestamp');
  if (printTs) printTs.innerText = `Generado el: ${dateFormatted}`;
});

// PESTAÑAS
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      document.getElementById(target).classList.add('active');
      
      if (target === 'tab-dashboard') {
        loadSummaryDashboard();
      } else if (target === 'tab-plan') {
        loadMaintenancePlan();
      }
    });
  });
}

// CARGA DE COMPONENTES DESDE EL BACKEND
async function loadAllComponents() {
  try {
    const res = await fetch('/api/components');
    allComponents = await res.json();
    
    populatePickerSelect();
    populateComponentLists();
    updateSvgColors();
    loadSummaryDashboard();
    
    // Seleccionar el primer elemento por defecto
    if (allComponents.length > 0 && !currentComponent) {
      selectComponent(allComponents[0].component_code);
    }
  } catch (err) {
    showToast('Error al conectar con la base de datos local.', 'danger');
  }
}

// POBLAR EL SELECTOR DE LA BARRA DE HERRAMIENTAS
function populatePickerSelect() {
  const select = document.getElementById('select-component-picker');
  if (!select) return;
  select.innerHTML = '';
  
  const groups = {};
  allComponents.forEach(c => {
    if (!groups[c.element_group]) groups[c.element_group] = [];
    groups[c.element_group].push(c);
  });
  
  for (const grp in groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = grp;
    groups[grp].forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.component_code;
      opt.textContent = `[${c.component_code}] ${c.component_name}`;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  }
}

// POBLAR LAS LISTAS DE LA PESTAÑA 1
function populateComponentLists() {
  const listSup = document.getElementById('list-superestructura');
  const listSub = document.getElementById('list-subestructura');
  const listCom = document.getElementById('list-complementarios');
  
  if (listSup) listSup.innerHTML = '';
  if (listSub) listSub.innerHTML = '';
  if (listCom) listCom.innerHTML = '';
  
  allComponents.forEach(c => {
    const card = document.createElement('div');
    card.className = 'comp-card-item';
    card.onclick = () => selectComponent(c.component_code);
    
    const color = getSeverityColor(c.condition_stat);
    const label = getSeverityLabel(c.condition_stat);
    
    card.innerHTML = `
      <div class="comp-item-info">
        <strong>${c.component_name}</strong>
        <span>Código: ${c.component_code} | IFC: ${c.ifc_class}</span>
      </div>
      <span class="comp-status-badge" style="background-color: ${color}">
        ${c.condition_stat.toFixed(2)} (${label})
      </span>
    `;
    
    if (c.element_group === 'Superestructura' && listSup) listSup.appendChild(card);
    else if (c.element_group === 'Subestructura' && listSub) listSub.appendChild(card);
    else if (listCom) listCom.appendChild(card);
  });
}

// ACTUALIZAR COLORES EN EL ESQUEMA SVG
function updateSvgColors() {
  const svgMap = {
    'SUP-LOS-T1': 'svg-los-t1',
    'SUP-LOS-T2': 'svg-los-t2',
    'SUP-LOS-T3': 'svg-los-t3',
    'SUP-VIG-T1': 'svg-vig-t1',
    'SUP-VIG-T2': 'svg-vig-t2',
    'SUP-VIG-T3': 'svg-vig-t3',
    'SUB-EST-IZQ': 'svg-est-izq',
    'SUB-EST-DER': 'svg-est-der',
    'SUB-PIL-P01': 'svg-pil-p01',
    'SUB-PIL-P02': 'svg-pil-p02',
    'SUB-CAI-ALL': 'svg-cai-all'
  };
  
  allComponents.forEach(c => {
    const svgId = svgMap[c.component_code];
    if (svgId) {
      const el = document.getElementById(svgId);
      if (el) {
        const color = getSeverityColor(c.condition_stat);
        // Si el elemento es un grupo (<g>), pintamos los rectángulos/polígonos interiores
        const shapes = el.querySelectorAll('rect, polygon');
        if (shapes.length > 0) {
          shapes.forEach(s => s.setAttribute('fill', color));
        } else {
          el.setAttribute('fill', color);
        }
      }
    }
  });
}

// SELECCIONAR UN COMPONENTE PARA LA FICHA
async function selectComponent(code) {
  try {
    const res = await fetch(`/api/components/${code}`);
    if (!res.ok) throw new Error('No encontrado');
    currentComponent = await res.json();
    
    // Cambiar a la pestaña de la ficha si estamos en otra
    const picker = document.getElementById('select-component-picker');
    if (picker) picker.value = code;
    
    renderComponentToFicha(currentComponent);
    
    // Si la selección se hizo desde el esquema, cambiamos a la pestaña Ficha
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    if (activeTab === 'tab-schema') {
      document.querySelector('[data-tab="tab-ficha"]').click();
    }
  } catch (err) {
    showToast('Error cargando componente: ' + code, 'danger');
  }
}

// RENDERIZAR DATOS EN LA FICHA OFICIAL
function renderComponentToFicha(data) {
  document.getElementById('f-component-display').innerText = `${data.component_name} (${data.component_code})`;
  document.getElementById('f-ifc-display').innerText = `IFC: ${data.ifc_class}`;
  document.getElementById('c-element-name').innerText = data.component_name;
  
  document.getElementById('f-evaluator').value = data.evaluator || 'Br. Christian Ivan Vilchez Tume';
  document.getElementById('f-datetime').value = data.date_time || new Date().toISOString().slice(0, 16).replace('T', ' ');
  
  // Metrados
  document.getElementById('m-largo').value = data.element_length || 0;
  document.getElementById('m-ancho').value = data.element_width || 0;
  document.getElementById('m-espesor').value = data.element_thickness || 0;
  document.getElementById('f-unit-label').innerText = data.unit || 'm³';
  
  // Factor de importancia
  document.getElementById('c-factor-importancia').value = data.importance_factor || 1.0;
  
  // Foto y comentarios
  const preview = document.getElementById('f-photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  if (data.photo_data && data.photo_data.trim().length > 0) {
    preview.src = data.photo_data;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
  
  document.getElementById('f-photo-desc').value = data.photo_description || '';
  document.getElementById('f-comments').value = data.comments || '';
  
  // Patologías
  renderPathologiesRows(data.pathologies || []);
  
  // Cálculos iniciales
  calculateMetrado();
  calculateAll();
}

// RENDERIZAR TABLA DE PATOLOGÍAS
function renderPathologiesRows(pathologies) {
  const tbody = document.getElementById('pathologies-body');
  tbody.innerHTML = '';
  
  if (!pathologies || pathologies.length === 0) {
    // Si no tiene patologías, agregamos una fila por defecto
    addPathologyRow('Sin patología aparente / Estado óptimo', 0, 0, 0, 0);
    return;
  }
  
  pathologies.forEach((p, idx) => {
    addPathologyRow(p.name, p.severity, p.length, p.width, p.thickness, p.volume);
  });
}

// AGREGAR FILA DE PATOLOGÍA
function addPathologyRow(name = '', severity = 0, length = 0, width = 0, thick = 0, vol = 0) {
  const tbody = document.getElementById('pathologies-body');
  const rowCount = tbody.querySelectorAll('tr').length + 1;
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align: center; font-weight: bold;">${rowCount}</td>
    <td>
      <input type="text" class="clean-input p-name" value="${escapeHtml(name)}" placeholder="Ej. Fisuración longitudinal / Corrosión superficial">
    </td>
    <td>
      <select class="clean-input p-sev" onchange="calculateAll()" style="font-weight: bold;">
        <option value="0" ${severity == 0 ? 'selected' : ''}>0 : Muy Bueno</option>
        <option value="1" ${severity == 1 ? 'selected' : ''}>1 : Bueno</option>
        <option value="2" ${severity == 2 ? 'selected' : ''}>2 : Regular</option>
        <option value="3" ${severity == 3 ? 'selected' : ''}>3 : Malo</option>
        <option value="4" ${severity == 4 ? 'selected' : ''}>4 : Muy Malo</option>
        <option value="5" ${severity == 5 ? 'selected' : ''}>5 : Pésimo</option>
      </select>
    </td>
    <td><input type="number" step="0.01" class="clean-num p-len" value="${length}" oninput="calculateRowVol(this)"></td>
    <td><input type="number" step="0.01" class="clean-num p-wid" value="${width}" oninput="calculateRowVol(this)"></td>
    <td><input type="number" step="0.01" class="clean-num p-thk" value="${thick}" oninput="calculateRowVol(this)"></td>
    <td style="text-align: center; font-weight: bold;"><span class="p-vol">${Number(vol || 0).toFixed(3)}</span></td>
    <td style="text-align: center;">
      <button class="btn btn-sm btn-outline no-print" onclick="removePathologyRow(this)" title="Eliminar fila">
        <i class="fa-solid fa-trash text-danger"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  calculateAll();
}

function removePathologyRow(btn) {
  const tr = btn.closest('tr');
  tr.remove();
  
  // Re-enumerar filas
  const tbody = document.getElementById('pathologies-body');
  tbody.querySelectorAll('tr').forEach((r, idx) => {
    r.querySelector('td:first-child').innerText = idx + 1;
  });
  
  calculateAll();
}

// CÁLCULO DE VOLUMEN DE FILA DE PATOLOGÍA
function calculateRowVol(input) {
  const tr = input.closest('tr');
  const l = parseFloat(tr.querySelector('.p-len').value) || 0;
  const w = parseFloat(tr.querySelector('.p-wid').value) || 0;
  const t = parseFloat(tr.querySelector('.p-thk').value) || 0;
  
  const volSpan = tr.querySelector('.p-vol');
  const vol = (l * w * t).toFixed(3);
  volSpan.innerText = vol;
  
  calculateAll();
}

// CÁLCULO DEL METRADO DEL ELEMENTO (LARGO X ANCHO X ESPESOR)
function calculateMetrado() {
  const l = parseFloat(document.getElementById('m-largo').value) || 0;
  const w = parseFloat(document.getElementById('m-ancho').value) || 0;
  const t = parseFloat(document.getElementById('m-espesor').value) || 0;
  
  let vol = l * w * t;
  if (vol <= 0) vol = 1.0; // Evitar división por cero
  
  document.getElementById('m-vol-total').innerText = vol.toFixed(3);
  return vol;
}

// CÁLCULO GLOBAL DE LA FICHA SCAP
function calculateAll() {
  const totalVol = calculateMetrado();
  const rows = document.querySelectorAll('#pathologies-body tr');
  
  let totalAffectedVol = 0.0;
  let weightedDamage = 0.0;
  
  rows.forEach(tr => {
    const sev = parseFloat(tr.querySelector('.p-sev').value) || 0;
    const vol = parseFloat(tr.querySelector('.p-vol').innerText) || 0;
    
    if (sev > 0 && vol > 0) {
      totalAffectedVol += vol;
      weightedDamage += (sev * vol);
    }
  });
  
  // Porcentajes
  let pctAffected = (totalAffectedVol / totalVol) * 100;
  if (pctAffected > 100) pctAffected = 100;
  const pctUnaffected = Math.max(0, 100 - pctAffected);
  const unaffectedVol = Math.max(0, totalVol - totalAffectedVol);
  
  document.getElementById('calc-vol-no-afectado').innerText = unaffectedVol.toFixed(3);
  document.getElementById('calc-vol-afectado').innerText = totalAffectedVol.toFixed(3);
  document.getElementById('calc-pct-no-afectado').innerText = pctUnaffected.toFixed(2) + ' %';
  document.getElementById('calc-pct-afectado').innerText = pctAffected.toFixed(2) + ' %';
  
  // Condición Estadística SCAP (Escala 0 a 5)
  // Fórmula SCAP: suma de (daño * severidad) / volumen total
  let conditionStat = 0.0;
  if (totalVol > 0) {
    conditionStat = weightedDamage / totalVol;
  }
  conditionStat = Math.min(5.0, Math.max(0.0, conditionStat));
  
  document.getElementById('c-condicion').innerText = conditionStat.toFixed(2);
  
  calculateContribution();
}

// CÁLCULO DE LA CONTRIBUCIÓN AL PUENTE
function calculateContribution() {
  const cond = parseFloat(document.getElementById('c-condicion').innerText) || 0;
  const factor = parseFloat(document.getElementById('c-factor-importancia').value) || 1.0;
  const contribution = cond * factor;
  
  document.getElementById('c-contribucion').innerText = contribution.toFixed(3);
}

// GUARDAR LA FICHA ACTUAL EN EL BACKEND
async function saveCurrentFicha() {
  if (!currentComponent) {
    showToast('Selecciona un componente primero.', 'danger');
    return;
  }
  
  const pathologies = [];
  document.querySelectorAll('#pathologies-body tr').forEach(tr => {
    const name = tr.querySelector('.p-name').value.trim();
    const sev = parseFloat(tr.querySelector('.p-sev').value) || 0;
    const l = parseFloat(tr.querySelector('.p-len').value) || 0;
    const w = parseFloat(tr.querySelector('.p-wid').value) || 0;
    const t = parseFloat(tr.querySelector('.p-thk').value) || 0;
    const vol = parseFloat(tr.querySelector('.p-vol').innerText) || 0;
    
    if (name.length > 0 || vol > 0) {
      pathologies.push({ name, severity: sev, length: l, width: w, thickness: t, volume: vol });
    }
  });
  
  const payload = {
    evaluator: document.getElementById('f-evaluator').value,
    date_time: document.getElementById('f-datetime').value,
    element_length: parseFloat(document.getElementById('m-largo').value) || 0,
    element_width: parseFloat(document.getElementById('m-ancho').value) || 0,
    element_thickness: parseFloat(document.getElementById('m-espesor').value) || 0,
    element_volume: parseFloat(document.getElementById('m-vol-total').innerText) || 0,
    importance_factor: parseFloat(document.getElementById('c-factor-importancia').value) || 1.0,
    photo_data: document.getElementById('f-photo-preview').src || '',
    photo_description: document.getElementById('f-photo-desc').value,
    comments: document.getElementById('f-comments').value,
    pathologies: pathologies
  };
  
  try {
    const res = await fetch(`/api/components/${currentComponent.component_code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error('Error al guardar');
    
    showToast(`Inspección de [${currentComponent.component_code}] guardada exitosamente.`, 'success');
    
    // Recargar componentes para actualizar colores y estadísticas
    await loadAllComponents();
  } catch (err) {
    showToast('Error al guardar la inspección: ' + err.message, 'danger');
  }
}

// RESTABLECER FORMULARIO DE LA FICHA
function resetFichaForm() {
  if (confirm('¿Deseas reiniciar los valores de esta ficha a su estado original?')) {
    if (currentComponent) {
      selectComponent(currentComponent.component_code);
    }
  }
}

// IMPRIMIR / EXPORTAR A PDF
function printOfficialFicha() {
  // Asegurarnos de que estamos en la pestaña Ficha
  document.querySelector('[data-tab="tab-ficha"]').click();
  
  // Actualizar timestamp
  const now = new Date();
  document.getElementById('print-timestamp').innerText = `Reporte SCAP Oficial generado el ${now.toLocaleDateString()} a las ${now.toLocaleTimeString()}`;
  
  window.print();
}

// MANEJO DE FOTOS: DRAG & DROP Y SELECCIÓN
function setupPhotoDropzone() {
  const dropzone = document.getElementById('photo-dropzone');
  const input = document.getElementById('f-photo-input');
  
  if (!dropzone || !input) return;
  
  dropzone.addEventListener('click', () => input.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#2563eb';
    dropzone.style.background = '#eff6ff';
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#000';
    dropzone.style.background = '#fafafa';
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#000';
    dropzone.style.background = '#fafafa';
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  });
}

function handlePhotoUpload(event) {
  if (event.target.files && event.target.files[0]) {
    processImageFile(event.target.files[0]);
  }
}

// SOPORTE PARA PEGAR FOTOS DIRECTAMENTE (CTRL+V)
function setupClipboardPaste() {
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        processImageFile(file);
        showToast('Foto pegada desde el portapapeles.', 'success');
        break;
      }
    }
  });
}

function processImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('f-photo-preview');
    const placeholder = document.getElementById('photo-placeholder');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// CARGA DEL DASHBOARD DE RESULTADOS Y DIAGNÓSTICO
async function loadSummaryDashboard() {
  try {
    const res = await fetch('/api/summary');
    const data = await res.json();
    
    // KPI Header
    const scapVal = document.getElementById('header-scap-value');
    if (scapVal) scapVal.innerText = data.global_scap_index.toFixed(2);
    const headerStatus = document.getElementById('header-scap-status');
    if (headerStatus) {
      headerStatus.innerText = data.qualitative_status;
      headerStatus.style.color = data.status_color;
    }
    const headerCircle = document.getElementById('header-badge-circle');
    if (headerCircle) {
      headerCircle.style.borderColor = data.status_color;
    }
    
    // KPI Hero
    document.getElementById('dash-global-index').innerText = data.global_scap_index.toFixed(2);
    document.getElementById('dash-global-status').innerText = data.qualitative_status;
    document.getElementById('dash-global-status').style.color = data.status_color;
    document.getElementById('dash-priority-text').innerText = data.maintenance_priority;
    document.getElementById('dash-inspected-ratio').innerText = `${data.inspected_count} / ${data.total_components} Elementos`;
    
    const circle = document.getElementById('dash-scap-circle');
    circle.style.borderColor = data.status_color;
    
    // Poblar tabla consolidada
    populateConsolidatedTable(data.components);
  } catch (err) {
    console.error('Error cargando resumen:', err);
  }
}

function populateConsolidatedTable(components) {
  const tbody = document.getElementById('consolidated-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  components.forEach(c => {
    const tr = document.createElement('tr');
    const color = getSeverityColor(c.condition_stat);
    const label = getSeverityLabel(c.condition_stat);
    
    tr.innerHTML = `
      <td><strong>${c.component_code}</strong></td>
      <td><span class="badge-version">${c.element_group}</span></td>
      <td>${c.component_name}</td>
      <td><code>${c.ifc_class}</code></td>
      <td>${c.element_volume.toFixed(2)}</td>
      <td>${c.pct_affected.toFixed(1)}%</td>
      <td style="font-weight: bold; text-align: center;">${c.condition_stat.toFixed(2)}</td>
      <td style="text-align: center;">${c.importance_factor.toFixed(2)}</td>
      <td style="font-weight: bold; text-align: center; color: var(--primary);">${c.bridge_contribution.toFixed(3)}</td>
      <td><span class="comp-status-badge" style="background-color: ${color}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// EXPORTAR A EXCEL (.CSV)
function exportToCSV() {
  if (allComponents.length === 0) return;
  
  let csv = 'Código,Grupo,Componente,IFC,Volumen(m3),PctAfectado(%),CondicionEstadistica,FactorImportancia,Contribucion,Estado\n';
  allComponents.forEach(c => {
    const label = getSeverityLabel(c.condition_stat);
    csv += `"${c.component_code}","${c.element_group}","${c.component_name}","${c.ifc_class}",${c.element_volume},${c.pct_affected},${c.condition_stat},${c.importance_factor},${c.bridge_contribution},"${label}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Matriz_SCAP_Puente_Sanchez_Cerro_Vilchez_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// DESCARGAR DATASET BIM EN FORMATO JSON / IFC-READY
async function downloadBimDataset() {
  try {
    const res = await fetch('/api/export/bim');
    const data = await res.json();
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BrIM_SCAP_Puente_Sanchez_Cerro_Dataset_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    
    showToast('Dataset BIM exportado exitosamente.', 'success');
  } catch (err) {
    showToast('Error exportando BIM dataset', 'danger');
  }
}

// UTILIDADES DE COLOR Y LABELS SCAP
function getSeverityColor(score) {
  if (score < 1.0) return '#10b981'; // green
  if (score < 2.0) return '#3b82f6'; // blue
  if (score < 3.0) return '#f59e0b'; // amber/yellow
  if (score < 4.0) return '#ef4444'; // red
  return '#991b1b'; // dark red
}

function getSeverityLabel(score) {
  if (score < 1.0) return 'Muy Bueno';
  if (score < 2.0) return 'Bueno';
  if (score < 3.0) return 'Regular';
  if (score < 4.0) return 'Malo';
  return 'Pésimo';
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.className = 'toast';
  if (type === 'danger') toast.style.backgroundColor = '#dc2626';
  else if (type === 'success') toast.style.backgroundColor = '#059669';
  else toast.style.backgroundColor = '#1e293b';
  
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// =========================================================
// MÓDULO: PLAN DE MANTENIMIENTO INTEGRAL (TAB 5)
// =========================================================
let currentMaintenancePlan = null;
let currentFilterGroup = 'ALL';

async function loadMaintenancePlan() {
  try {
    const res = await fetch('/api/maintenance-plan');
    if (!res.ok) throw new Error('Error al obtener plan');
    currentMaintenancePlan = await res.json();

    // Actualizar KPIs del Presupuesto
    const cs = currentMaintenancePlan.cost_summary;
    const formatPEN = (num) => 'S/. ' + Number(num).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('plan-total-presupuesto').innerText = formatPEN(cs.presupuesto_total);
    document.getElementById('plan-costo-directo').innerText = formatPEN(cs.costo_directo);
    document.getElementById('plan-gg-utilidad').innerText = formatPEN(cs.gastos_generales + cs.utilidad);
    document.getElementById('plan-igv').innerText = formatPEN(cs.igv);

    renderPlanActionsTable();
    renderPlanBudgetTable();
  } catch (err) {
    showToast('Error cargando el Plan de Mantenimiento: ' + err.message, 'danger');
  }
}

function filterPlanActions(grp) {
  currentFilterGroup = grp;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderPlanActionsTable();
}

function renderPlanActionsTable() {
  if (!currentMaintenancePlan) return;
  const tbody = document.getElementById('plan-actions-tbody');
  tbody.innerHTML = '';

  const filtered = currentMaintenancePlan.actions.filter(a => {
    if (currentFilterGroup === 'ALL') return true;
    return a.group === currentFilterGroup;
  });

  filtered.forEach(a => {
    const tr = document.createElement('tr');
    const color = getSeverityColor(a.score);
    
    tr.innerHTML = `
      <td><strong>${a.code}</strong></td>
      <td><strong>${a.name}</strong><br><span class="text-muted" style="font-size: 0.72rem;">${a.specification}</span></td>
      <td><span class="comp-status-badge" style="background-color: ${color}">${a.score.toFixed(2)} (${a.condition_label})</span></td>
      <td><span class="badge-version">${a.action_type}</span></td>
      <td>${a.action_text}</td>
      <td><strong>${a.frequency}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPlanBudgetTable() {
  if (!currentMaintenancePlan) return;
  const tbody = document.getElementById('plan-budget-tbody');
  const tfoot = document.getElementById('plan-budget-tfoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  const formatPEN = (num) => Number(num).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  currentMaintenancePlan.budget_items.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: bold; text-align: center;">${b.item_number}</td>
      <td><code>${b.component_code}</code></td>
      <td><strong>${b.description}</strong><br><span class="text-muted" style="font-size: 0.72rem;">Elemento: ${b.component_name}</span></td>
      <td style="text-align: center;">${b.unit}</td>
      <td style="text-align: right; font-weight: 600;">${formatPEN(b.quantity)}</td>
      <td style="text-align: right;">${formatPEN(b.unit_price)}</td>
      <td style="text-align: right; font-weight: bold; color: var(--unp-blue);">${formatPEN(b.total_price)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Filas de Pie de Presupuesto
  const cs = currentMaintenancePlan.cost_summary;
  tfoot.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: right; font-weight: bold;">COSTO DIRECTO TOTAL (C.D.):</td>
      <td style="text-align: right; font-weight: bold;">S/. ${formatPEN(cs.costo_directo)}</td>
    </tr>
    <tr>
      <td colspan="6" style="text-align: right;">GASTOS GENERALES (10.00%):</td>
      <td style="text-align: right;">S/. ${formatPEN(cs.gastos_generales)}</td>
    </tr>
    <tr>
      <td colspan="6" style="text-align: right;">UTILIDAD CONTRATISTA (7.00%):</td>
      <td style="text-align: right;">S/. ${formatPEN(cs.utilidad)}</td>
    </tr>
    <tr>
      <td colspan="6" style="text-align: right; font-weight: bold;">SUBTOTAL DE OBRA:</td>
      <td style="text-align: right; font-weight: bold;">S/. ${formatPEN(cs.subtotal)}</td>
    </tr>
    <tr>
      <td colspan="6" style="text-align: right;">IMPUESTO GENERAL A LAS VENTAS (I.G.V. 18.00%):</td>
      <td style="text-align: right;">S/. ${formatPEN(cs.igv)}</td>
    </tr>
    <tr class="highlight-total">
      <td colspan="6" style="text-align: right; font-size: 1rem; font-weight: 900;">PRESUPUESTO TOTAL DE LA PROPUESTA:</td>
      <td style="text-align: right; font-size: 1rem; font-weight: 900; color: var(--unp-blue);">S/. ${formatPEN(cs.presupuesto_total)}</td>
    </tr>
  `;
}

// EXPORTAR PRESUPUESTO DEL PLAN A EXCEL (.CSV)
function exportMaintenanceBudgetCSV() {
  if (!currentMaintenancePlan || !currentMaintenancePlan.budget_items) return;

  let csv = 'Item,Codigo,Partida,Elemento,Unidad,Metrado,PrecioUnitario_PEN,TotalParcial_PEN\n';
  currentMaintenancePlan.budget_items.forEach(b => {
    csv += `"${b.item_number}","${b.component_code}","${b.description}","${b.component_name}","${b.unit}",${b.quantity},${b.unit_price},${b.total_price}\n`;
  });

  const cs = currentMaintenancePlan.cost_summary;
  csv += `\n,,,,,"COSTO DIRECTO",,${cs.costo_directo}\n`;
  csv += `,,,,,"GASTOS GENERALES (10%)",,${cs.gastos_generales}\n`;
  csv += `,,,,,"UTILIDAD (7%)",,${cs.utilidad}\n`;
  csv += `,,,,,"SUBTOTAL",,${cs.subtotal}\n`;
  csv += `,,,,,"IGV (18%)",,${cs.igv}\n`;
  csv += `,,,,,"PRESUPUESTO TOTAL",,${cs.presupuesto_total}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Presupuesto_Plan_Mantenimiento_Puente_Sanchez_Cerro_Vilchez_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Presupuesto exportado a Excel (.CSV) exitosamente.', 'success');
}

// IMPRIMIR / EXPORTAR PLAN DE MANTENIMIENTO A PDF
function printMaintenancePlanReport() {
  document.querySelector('[data-tab="tab-plan"]').click();
  window.print();
}
