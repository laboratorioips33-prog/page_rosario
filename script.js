// CONFIGURACIÓN
const API_URL = "https://2660ee008f84.ngrok-free.app/api";

// Variables de Estado para Herramientas (Extractor)
let extractedData = {};

// Variables de Estado para Sesión (Auth Python)
let currentUserUid = localStorage.getItem('app_uid');
let currentUserName = localStorage.getItem('app_name');

document.addEventListener('DOMContentLoaded', function() {
    
    // Al cargar, verificar si hay sesión activa para ajustar la vista "Mi Cuenta"
    if (currentUserUid) {
        checkAuthStatus(); // Verificar token/sesión en el backend
    }

    // ==========================================
    // 1. GESTIÓN DE VISTAS Y NAVEGACIÓN
    // ==========================================
    window.switchMainView = function(viewId) {
        // Botones de navegación superior
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        
        // Activar botón visualmente
        const btnIndex = viewId === 'view-tools' ? 0 : 1;
        document.querySelectorAll('.nav-btn')[btnIndex].classList.add('active');

        // Ocultar todas las vistas principales
        document.querySelectorAll('.main-view').forEach(view => view.classList.add('hidden'));
        
        // Mostrar la seleccionada
        const targetView = document.getElementById(viewId);
        if(targetView) targetView.classList.remove('hidden');
    };

    // Función para cambiar sub-vistas dentro de "Mi Cuenta" (Login vs Registro vs Dashboard)
    window.switchAccountView = function(viewId) {
        const accountViews = ['view-login', 'view-register', 'view-verify', 'view-dashboard'];
        accountViews.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('hidden');
        });
        const target = document.getElementById(viewId);
        if(target) target.classList.remove('hidden');
    };

    // Función para pestañas del Dashboard
    window.openDashTab = function(tabId) {
        document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dash-content').forEach(c => c.classList.remove('active'));

        // Activar botón (buscando por atributo onclick)
        const buttons = document.querySelectorAll('.dash-tab');
        buttons.forEach(btn => {
            if(btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
        });

        document.getElementById(tabId).classList.add('active');
    };

    // ==========================================
    // 2. LÓGICA DE HERRAMIENTAS (PDF / CSD)
    // ==========================================
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileNameDisplay = document.getElementById('fileName');

    if(uploadArea && fileInput) {
        // Drag & Drop events
        document.getElementById('selectFileBtn').addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#4361ee'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#e9ecef'; });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) handlePdfFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handlePdfFile(e.target.files[0]);
        });
    }

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
                    // Scroll suave hacia el formulario
                    document.getElementById('extractedDataCard').scrollIntoView({ behavior: 'smooth' });
                    showAlert('Datos extraídos correctamente.', 'success');
                } else {
                    throw new Error(res.detail || 'Error desconocido');
                }
            })
            .catch(err => showAlert('Error: ' + err.message, 'error'))
            .finally(() => setLoading('selectFileBtn', false));
    }

    function populateEmisorForm(data) {
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

        // Llenar listas
        renderList('regimenes-list', data.regimenes_disponibles, 'balance-scale-right', 'codigo');
        renderList('economic-activities', data.economic_activities, 'chart-line');
    }

    function renderList(containerId, items, icon, keyLabel) {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<p class="empty-message" style="color:grey; font-style:italic;">Sin datos</p>';
            return;
        }
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = typeof item === 'object' ? 'regimen-item' : 'activity-item';
            
            let text = item;
            if (typeof item === 'object' && item[keyLabel]) {
                text = `<strong>${item[keyLabel]}</strong> - ${item.descripcion || ''}`;
            }
            text = String(text).replace(/[{ } ']/g, ' ').trim();
            div.innerHTML = `<i class="fas fa-${icon}"></i> <span>${text}</span>`;
            container.appendChild(div);
        });
    }

    // Guardar Emisor (Botón en Herramientas)
    const emisorForm = document.getElementById('emisorForm');
    if(emisorForm) {
        emisorForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const payload = {
                phone_number: document.getElementById('phone_number').value,
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
                } else {
                    throw new Error(res.detail || 'Error al guardar');
                }
            })
            .catch(err => showAlert(err.message, 'error'))
            .finally(() => setLoading('saveBtn', false));
        });
    }

    // Subida CSD
    const csdForm = document.getElementById('csdForm');
    if (csdForm) {
        csdForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const form = new FormData(this);
            const btn = document.getElementById('csdUploadBtn');
            const pBar = document.getElementById('csdProgressBar');
            const pTrack = document.getElementById('csdProgress');
            
            btn.disabled = true; 
            btn.innerHTML = '<span class="spinner" style="width:15px;height:15px;"></span> Subiendo...';
            if(pTrack) pTrack.classList.remove('hidden');
            if(pBar) pBar.style.width = '50%';

            fetch(`${API_URL}/csd_upload`, { method: 'POST', body: form })
            .then(res => res.json())
            .then(res => {
                if(pBar) pBar.style.width = '100%';
                if(res.status === 'success' || res.message) {
                    showAlert(res.message || 'CSD Subido', 'success');
                    this.reset();
                } else {
                    throw new Error(res.message || res.detail);
                }
            })
            .catch(err => showAlert(err.message, 'error'))
            .finally(() => {
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Subir Archivos CSD';
                setTimeout(() => { if(pTrack) pTrack.classList.add('hidden'); if(pBar) pBar.style.width = '0'; }, 3000);
            });
        });
    }

    // ==========================================
    // 3. LÓGICA DE AUTENTICACIÓN (PYTHON BACKEND)
    // ==========================================

    // --- A. Registro ---
    const regForm = document.getElementById('registerForm');
    if(regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                first_name: document.getElementById('regName').value,
                last_name: document.getElementById('regLast').value,
                phone: document.getElementById('regPhone').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPass').value
            };

            try {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if(data.status === 'success') {
                    alert("Registro exitoso. Por favor, inicia sesión.");
                    switchAccountView('view-login');
                } else {
                    alert("Error: " + (data.detail || "Desconocido"));
                }
            } catch(err) { alert("Error de conexión al registrar."); }
        });
    }

    // --- B. Login ---
    const loginForm = document.getElementById('loginForm');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                email: document.getElementById('loginEmail').value,
                password: document.getElementById('loginPass').value
            };

            try {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if(data.status === 'success') {
                    // Guardar sesión localmente
                    currentUserUid = data.uid;
                    currentUserName = data.user_name;
                    localStorage.setItem('app_uid', data.uid);
                    localStorage.setItem('app_name', data.user_name);
                    
                    if(data.is_verified) {
                        // Si ya tiene whats verificado, ir al dashboard
                        showDashboard();
                    } else {
                        // Si no, ir a verificación
                        startVerificationProcess(data.uid);
                    }
                } else {
                    alert("Credenciales incorrectas: " + data.detail);
                }
            } catch(err) { alert("Error de conexión al login."); }
        });
    }

    // --- C. Verificar Estado (Auto-check al cargar) ---
    async function checkAuthStatus() {
        if (!currentUserUid) return;
        try {
            const res = await fetch(`${API_URL}/auth/get-status`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ uid: currentUserUid })
            });
            
            if(res.status === 404) {
                // Sesión inválida
                logout();
                return;
            }

            const data = await res.json();
            if (data.status === 'verified') {
                // Ya logueado y verificado -> Mostrar Dashboard directo
                // Forzamos que la vista de cuenta muestre el dashboard
                const dashView = document.getElementById('view-dashboard');
                if(dashView) dashView.classList.remove('hidden');
                document.getElementById('view-login').classList.add('hidden');
                
                // Cargar datos
                loadDashboardData(data.data);
            } else {
                // Logueado pero falta verificar -> Mostrar pantalla verificación
                const verifyView = document.getElementById('view-verify');
                if(verifyView) verifyView.classList.remove('hidden');
                document.getElementById('view-login').classList.add('hidden');
                
                // Preparamos pantalla
                setupVerificationUI(data.code, data.claimed_phone);
            }
        } catch(e) { console.error("Error checking auth status", e); }
    }

    // --- D. Proceso de Verificación ---
    function startVerificationProcess(uid) {
        // Pedimos estado para obtener el código
        fetch(`${API_URL}/auth/get-status`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ uid: uid })
        })
        .then(res => res.json())
        .then(data => {
            switchAccountView('view-verify');
            setupVerificationUI(data.code, data.claimed_phone);
        });
    }

    let pollInterval;
    function setupVerificationUI(code, phone) {
        document.getElementById('verifyName').innerText = currentUserName || "Usuario";
        document.getElementById('verifyPhone').innerText = phone || "...";
        document.getElementById('verificationCode').innerText = code || "Cargando...";

        // Iniciar Polling (preguntar cada 3s si ya se vinculó)
        if (pollInterval) clearInterval(pollInterval);
        
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/auth/get-status`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ uid: currentUserUid })
                });
                const data = await res.json();
                
                if (data.status === 'verified') {
                    clearInterval(pollInterval);
                    showDashboard();
                    loadDashboardData(data.data); // Cargar datos que vinieron en la respuesta
                }
            } catch(e) { console.error("Polling error", e); }
        }, 3000);
    }

    // --- E. Mostrar Dashboard ---
    window.showDashboard = function() {
        switchAccountView('view-dashboard');
        document.getElementById('dashUser').innerText = currentUserName;
        // Si no tenemos datos cargados aún, los pedimos
        fetchDashboardData();
    };

    function fetchDashboardData() {
        fetch(`${API_URL}/dashboard/get-data`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ uid: currentUserUid })
        })
        .then(res => res.json())
        .then(res => {
            if(res.status === 'success') {
                loadDashboardData(res.data);
            }
        });
    }

    function loadDashboardData(data) {
        if(!data) return;
        renderTable('tableFacturas', data.facturas, ['folio', 'receptor', 'total', 'estado_pago', 'pdf']);
        renderTable('tableEmisores', data.emisores, ['Rfc', 'Name', 'delete']);
    }

    // Render de tablas del Dashboard
    function renderTable(tableId, data, columns) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        if(!tbody) return;
        tbody.innerHTML = '';
        
        if(!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center" style="color:grey; padding:15px;">No hay registros</td></tr>`;
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                if(col === 'total') {
                    td.textContent = `$${parseFloat(row.total || 0).toFixed(2)}`;
                } else if(col === 'pdf') {
                    td.innerHTML = row.pdf_url ? `<a href="${row.pdf_url}" target="_blank" class="btn btn-sm">PDF</a>` : '-';
                } else if(col === 'delete') {
                    td.innerHTML = `<button class="btn btn-sm btn-danger" onclick="deleteItem('emisor', '${row.Rfc}')"><i class="fas fa-trash"></i></button>`;
                } else {
                    td.textContent = row[col] || row[col.toLowerCase()] || 'N/A';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    window.logout = function() {
        localStorage.clear();
        location.reload();
    };

    window.deleteItem = function(type, id) {
        if(!confirm('¿Eliminar?')) return;
        fetch(`${API_URL}/delete-emisor`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone_number: "AUTO_DETECTED_IN_BACKEND", rfc: id }) 
            // Nota: Tu backend necesitará ajustar delete-emisor para aceptar UID o el usuario deberá mandar su teléfono guardado
            // Como estamos en "Backend-First", lo ideal es crear un endpoint /api/dashboard/delete que reciba {uid, rfc}
        }).then(() => {
            alert("Eliminado");
            fetchDashboardData();
        });
    }

    // ==========================================
    // UTILS UI
    // ==========================================
    function showAlert(msg, type) {
        const div = document.createElement('div');
        div.className = `alert alert-${type}`;
        div.textContent = msg;
        const container = document.getElementById('alerts'); // Contenedor en form extractor
        if(container) {
            container.innerHTML = '';
            container.appendChild(div);
            setTimeout(() => div.remove(), 4000);
        } else {
            alert(msg);
        }
    }

    function setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        if(isLoading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner" style="width:15px;height:15px;"></span> Procesando...';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalText || 'Enviar';
            btn.disabled = false;
        }
    }
});
