// CONFIGURACIÓN
const API_URL = "https://yo-te-facturo-717890543339.us-central1.run.app/api"; // Tu API
// const API_URL = "http://localhost:8000/api"; // Para pruebas locales

document.addEventListener('DOMContentLoaded', function() {
    
    // --- REFERENCIAS GLOBALES ---
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileNameDisplay = document.getElementById('fileName');
    
    // --- ESTADO INICIAL ---
    checkSession(); // Revisa si ya hay login al cargar

    // ==========================================
    // 1. NAVEGACIÓN Y VISTAS
    // ==========================================
    window.switchMainView = function(viewId) {
        // Botones nav
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        // Si clickea "Herramientas" (index 0) o "Mi Cuenta" (index 1)
        const btnIndex = viewId === 'view-tools' ? 0 : 1;
        document.querySelectorAll('.nav-btn')[btnIndex].classList.add('active');

        // Contenedores
        document.querySelectorAll('.main-view').forEach(view => view.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

    window.openDashTab = function(tabId) {
        document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dash-content').forEach(c => c.classList.remove('active'));

        // Activar botón clickeado (buscamos por texto o evento, aquí simplificado)
        // Nota: en el HTML onclick pasamos el ID. Lo mejor es iterar botones y comparar.
        const buttons = document.querySelectorAll('.dash-tab');
        buttons.forEach(btn => {
            if(btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
        });

        document.getElementById(tabId).classList.add('active');
    };

    // ==========================================
    // 2. HERRAMIENTAS: EXTRACTOR PDF & GUARDADO
    // ==========================================
    
    // Eventos Drag & Drop
    document.getElementById('selectFileBtn').addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault(); uploadArea.style.borderColor = '#4361ee';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#e9ecef';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) handlePdfFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handlePdfFile(e.target.files[0]);
    });

    let extractedData = {}; // Cache de datos extraídos

    function handlePdfFile(file) {
        if (file.type !== 'application/pdf') return showAlert('Solo archivos PDF.', 'error');
        
        fileNameDisplay.textContent = file.name;
        showAlert('Procesando PDF...', 'success');
        
        const formData = new FormData();
        formData.append('file', file);

        setLoading('selectFileBtn', true);

        fetch(`${API_URL}/extract-emisor-from-pdf`, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') {
                    extractedData = res.data;
                    populateEmisorForm(res.data);
                    document.getElementById('extractedDataCard').classList.remove('hidden');
                    window.scrollTo({ top: document.getElementById('extractedDataCard').offsetTop - 50, behavior: 'smooth' });
                    showAlert('Datos extraídos correctamente.', 'success');
                } else {
                    throw new Error(res.detail || 'Error desconocido');
                }
            })
            .catch(err => showAlert('Error: ' + err.message, 'error'))
            .finally(() => setLoading('selectFileBtn', false));
    }

    function populateEmisorForm(data) {
        // Llenar inputs
        document.getElementById('rfc').value = data.rfc || '';
        document.getElementById('name').value = data.name || '';
        document.getElementById('zip_code').value = data.zip_code || '';
        
        const addr = data.address || {};
        document.getElementById('street').value = addr.Street || '';
        document.getElementById('exterior_number').value = addr.ExteriorNumber || '';
        document.getElementById('interior_number').value = addr.InteriorNumber || '';
        document.getElementById('neighborhood').value = addr.Neighborhood || '';
        document.getElementById('city').value = addr.City || addr.Municipality || '';
        document.getElementById('state').value = addr.State || '';
        document.getElementById('country').value = addr.Country || 'MX';

        // Autocompletar RFC en CSD
        document.getElementById('csd_rfc').value = data.rfc || '';

        // Listas
        renderList('regimenes-list', data.regimenes_disponibles, 'balance-scale-right', 'codigo');
        renderList('economic-activities', data.economic_activities, 'chart-line');
    }

    function renderList(containerId, items, icon, keyLabel) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<p class="empty-message">Sin datos</p>';
            return;
        }
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = typeof item === 'object' ? 'regimen-item' : 'activity-item';
            
            let text = item;
            if (typeof item === 'object' && item[keyLabel]) {
                text = `<strong>${item[keyLabel]}</strong> - ${item.descripcion || ''}`;
            }
            // Limpieza de strings sucios
            text = String(text).replace(/[{ } ']/g, ' ').trim();

            div.innerHTML = `<i class="fas fa-${icon}"></i> <span>${text}</span>`;
            container.appendChild(div);
        });
    }

    // Guardar Emisor
    document.getElementById('emisorForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Construir objeto
        const payload = {
            phone_number: document.getElementById('phone_number').value, // El teléfono es CLAVE
            rfc: document.getElementById('rfc').value,
            name: document.getElementById('name').value,
            fiscal_regimes: (extractedData.regimenes_disponibles || []).map(r => r.codigo || r),
            economic_activities: extractedData.economic_activities || [],
            zip_code: document.getElementById('zip_code').value,
            address: {
                Street: document.getElementById('street').value,
                ExteriorNumber: document.getElementById('exterior_number').value,
                InteriorNumber: document.getElementById('interior_number').value,
                Neighborhood: document.getElementById('neighborhood').value,
                Municipality: document.getElementById('city').value,
                State: document.getElementById('state').value,
                Country: document.getElementById('country').value,
                ZipCode: document.getElementById('zip_code').value
            }
        };

        if(!payload.phone_number) return showAlert("Ingresa un número de teléfono.", "error");

        setLoading('saveBtn', true);
        fetch(`${API_URL}/save-emisor`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(res => {
            if(res.status === 'success') {
                showAlert('¡Guardado exitosamente!', 'success');
                // Si el usuario ya está logueado y coincide el teléfono, recargar tabla
                if(localStorage.getItem('userPhone') === payload.phone_number) {
                    loadDashboardData(payload.phone_number);
                }
            } else {
                throw new Error(res.detail || 'Error al guardar');
            }
        })
        .catch(err => showAlert(err.message, 'error'))
        .finally(() => setLoading('saveBtn', false));
    });

    // ==========================================
    // 3. SUBIDA CSD (Tu código original)
    // ==========================================
    document.getElementById('csdForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const form = new FormData(this);
        const btn = document.getElementById('csdUploadBtn');
        const pBar = document.getElementById('csdProgressBar');
        
        btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:15px;height:15px;border-width:2px;"></span> Subiendo...';
        document.getElementById('csdProgress').classList.remove('hidden');

        // Simulación visual de progreso (Fetch no tiene onprogress nativo fácil)
        pBar.style.width = '50%';

        fetch(`${API_URL}/csd_upload`, { method: 'POST', body: form }) // Nota: el endpoint en python se llama csd_upload
        .then(res => res.json())
        .then(res => {
            pBar.style.width = '100%';
            if(res.status === 'success' || res.message) {
                showAlert(res.message || 'CSD Subido', 'success');
                this.reset();
            } else {
                throw new Error(res.message || res.detail);
            }
        })
        .catch(err => showAlert(err.message, 'error'))
        .finally(() => {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Subir Archivos CSD';
            setTimeout(() => { document.getElementById('csdProgress').classList.add('hidden'); pBar.style.width = '0'; }, 3000);
        });
    });

    // ==========================================
    // 4. LOGIN & DASHBOARD (NUEVO)
    // ==========================================
    
    // Generar Código
    document.getElementById('btnGenerate').addEventListener('click', () => {
        fetch(`${API_URL}/generate-link-code`)
        .then(res => res.json())
        .then(data => {
            document.getElementById('generatedCode').textContent = data.code;
            document.getElementById('btnGenerate').classList.add('hidden');
            document.getElementById('loadingStatus').classList.remove('hidden');
            startPolling(data.code);
        })
        .catch(() => alert('Error de conexión con el servidor'));
    });

    // Polling
    function startPolling(code) {
        const interval = setInterval(() => {
            fetch(`${API_URL}/check-link-status`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ code })
            })
            .then(res => res.json())
            .then(res => {
                if(res.status === 'linked') {
                    clearInterval(interval);
                    loginSuccess(res.phone_number);
                }
            });
        }, 3000);
    }

    function loginSuccess(phone) {
        localStorage.setItem('userPhone', phone);
        checkSession();
    }

    window.logout = function() {
        localStorage.removeItem('userPhone');
        location.reload();
    };

    function checkSession() {
        const phone = localStorage.getItem('userPhone');
        if(phone) {
            // Mostrar Dashboard
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('dashboard-content').classList.remove('hidden');
            document.getElementById('userPhoneDisplay').textContent = phone;
            
            // Auto-llenar el teléfono en el extractor para facilitar
            document.getElementById('phone_number').value = phone.replace('whatsapp:', '').replace('+521', '');
            
            loadDashboardData(phone);
        } else {
            // Mostrar Login
            document.getElementById('login-section').classList.remove('hidden');
            document.getElementById('dashboard-content').classList.add('hidden');
        }
    }

    // Cargar Datos Dashboard
    function loadDashboardData(phone) {
        fetch(`${API_URL}/get-dashboard-data`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone_number: phone })
        })
        .then(res => res.json())
        .then(res => {
            if(res.status === 'success') {
                renderTable('tableFacturas', res.data.facturas, ['folio', 'timestamp', 'receptor', 'total', 'estado_pago', 'actions']);
                renderTable('tableEmisores', res.data.emisores, ['Rfc', 'Name', 'ExpeditionPlace', 'delete']);
                renderTable('tableComplementos', res.data.complementos, ['folio_cp', 'uuid_factura', 'fecha_pago', 'monto', 'saldo_insoluto']);
            }
        });
    }

    // Render Genérico de Tablas
    function renderTable(tableId, data, columns) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        tbody.innerHTML = '';
        
        if(!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center text-muted">No hay registros encontrados</td></tr>`;
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');
            
            columns.forEach(col => {
                const td = document.createElement('td');
                
                if(col === 'timestamp') {
                    td.textContent = row.timestamp ? new Date(row.timestamp).toLocaleDateString() : 'N/A';
                } else if(col === 'total' || col === 'monto' || col === 'saldo_insoluto') {
                    td.textContent = `$${parseFloat(row[col] || 0).toFixed(2)}`;
                } else if(col === 'actions') { // Botones PDF/XML
                    td.innerHTML = `
                        ${row.pdf_url ? `<a href="${row.pdf_url}" target="_blank" class="btn btn-sm" style="padding:2px 8px"><i class="fas fa-file-pdf"></i></a>` : ''}
                        ${row.xml_url ? `<a href="${row.xml_url}" target="_blank" class="btn btn-sm btn-secondary" style="padding:2px 8px"><i class="fas fa-file-code"></i></a>` : ''}
                    `;
                } else if(col === 'delete') { // Botón Eliminar
                    td.innerHTML = `<button class="btn btn-sm btn-danger" onclick="deleteItem('emisor', '${row.Rfc}')"><i class="fas fa-trash"></i></button>`;
                } else {
                    td.textContent = row[col] || 'N/A';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    // Eliminar Item (Emisor)
    window.deleteItem = function(type, id) {
        if(!confirm('¿Estás seguro de eliminar este registro?')) return;
        
        const phone = localStorage.getItem('userPhone');
        fetch(`${API_URL}/delete-emisor`, { // Asumimos delete-emisor por ahora
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone_number: phone, rfc: id })
        })
        .then(res => res.json())
        .then(res => {
            if(res.status === 'success') {
                showAlert('Eliminado correctamente', 'success');
                loadDashboardData(phone);
            } else {
                alert('No se pudo eliminar');
            }
        });
    };

    // Utils
    function showAlert(msg, type) {
        const div = document.createElement('div');
        div.className = `alert alert-${type}`;
        div.textContent = msg;
        const container = document.getElementById('alerts'); // Alerta en extractor
        if(container) {
            container.innerHTML = '';
            container.appendChild(div);
            setTimeout(() => div.remove(), 4000);
        } else {
            alert(msg); // Fallback
        }
    }

    function setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        if(isLoading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner" style="width:15px;height:15px;display:inline-block"></span> Procesando...';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalText;
            btn.disabled = false;
        }
    }
});
