// CONFIGURACIÓN
const API_URL = "https://facturaia-636128386552.us-central1.run.app/api";
const BASE_URL = "https://facturaia-636128386552.us-central1.run.app";

// Variables de Estado
let currentUserUid = localStorage.getItem('app_uid');
let currentUserName = localStorage.getItem('app_name');
let extractedDataCache = {}; // Cache del PDF

// =========================================
// 0. INICIALIZACIÓN
// =========================================
function goToLogin() {
    document.getElementById('landing-page').classList.add('hidden');      // Oculta Landing
    document.getElementById('auth-container').classList.remove('hidden'); // Muestra Auth
    switchAuthView('view-login'); // Asegura que se vea el formulario de login
}

// Función para ir al Registro desde la Landing
function goToRegister() {
    document.getElementById('landing-page').classList.add('hidden');      // Oculta Landing
    document.getElementById('auth-container').classList.remove('hidden'); // Muestra Auth
    switchAuthView('view-register'); // Asegura que se vea el formulario de registro
}

// Función para volver a la Landing desde Login/Registro
function goToHome() {
    document.getElementById('auth-container').classList.add('hidden');    // Oculta Auth
    document.getElementById('landing-page').classList.remove('hidden');   // Muestra Landing
}

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si hay usuario guardado
    if (currentUserUid) {
        checkAuthStatus();
    } else {
        // CORRECCIÓN: Si no hay usuario, aseguramos que se vea la Landing
        // y se oculte el Auth Container.
        document.getElementById('landing-page').classList.remove('hidden');
        document.getElementById('auth-container').classList.add('hidden');
    }

    // Inicializar listeners...
    setupExtractorListeners();
    setupCSDListener();
});

// =========================================
// 1. MANEJO DE VISTAS (NAVEGACIÓN)
// =========================================

function switchAuthView(viewId) {
    ['view-login', 'view-register', 'view-verify'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

window.switchDashView = function(viewId) {
    // 1. Actualizar links activos en el sidebar
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.remove('active');
        if(a.getAttribute('onclick').includes(viewId)) a.classList.add('active');
    });

    // 2. Mostrar la vista correcta
    document.querySelectorAll('.dash-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
};

// =========================================
// 2. AUTENTICACIÓN
// =========================================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
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
            handleLoginSuccess(data);
        } else {
            alert(data.detail || "Error en credenciales");
        }
    } catch(e) { alert("Error de conexión"); }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
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
        if(res.ok) {
            alert("Registro exitoso. Inicia sesión.");
            switchAuthView('view-login');
        } else {
            alert("Error en registro");
        }
    } catch(e) { alert("Error de red"); }
});

function handleLoginSuccess(data) {
    currentUserUid = data.uid;
    currentUserName = data.user_name;
    localStorage.setItem('auth_token', data.idToken);
    localStorage.setItem('app_name', data.user_name);

    if(data.is_verified) {
        showDashboard();
    } else {
        startVerification(data.uid);
    }
}

function startVerification(uid) {
    document.getElementById('auth-container').classList.remove('hidden');
    switchAuthView('view-verify');
    
    fetch(`${API_URL}/auth/get-status`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ uid: uid })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('verificationCode').innerText = data.code;
        startPolling(uid);
    });
}

function startPolling(uid) {
    const interval = setInterval(async () => {
        const res = await fetch(`${API_URL}/auth/get-status`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ uid: uid })
        });
        const data = await res.json();
        if(data.status === 'verified') {
            clearInterval(interval);
            showDashboard();
            loadAllData(data.data);
        }
    }, 3000);
}

// =========================================
// 3. DASHBOARD Y DATOS
// =========================================

function showDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-layout').classList.remove('hidden');
    document.getElementById('dashUser').innerText = currentUserName || "Usuario";
    fetchDashboardData();
}

function fetchDashboardData() {
    // Nota: Ya no enviamos { uid: currentUserUid } en el body
    // El backend sacará el UID del token automáticamente.
    authFetch(`${API_URL}/dashboard/get-data`, {
        method: 'POST', 
        body: JSON.stringify({}) // Body vacío (o con filtros si necesitas)
    })
    .then(res => {
        if(res) return res.json(); // Validamos que res exista
    })
    .then(res => {
        if (res && res.status === 'success') {
            loadAllData(res.data);
            if(res.phone) { 
                document.getElementById('phone_number').value = res.phone.replace('whatsapp:+521', '');
            }
        }
    })
    .catch(err => console.error("Error fetching dashboard:", err));
}



function loadAllData(data) {
    if(!data) return;
    renderEmisores(data.emisores);
    renderReceptores(data.receptores);
    renderFacturas(data.facturas);
    renderNotas(data.notas_credito);
    renderComplementos(data.complementos);
}

// --- RENDERIZADORES DE TABLAS ---
function renderEmisores(list) {
    const tbody = document.querySelector('#tableEmisores tbody');
    tbody.innerHTML = '';
    (list || []).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.Rfc}</td><td>${item.Name}</td><td>${item.ExpeditionPlace || ''}</td>
            <td class="text-right"><button class="btn btn-sm btn-danger" onclick="deleteItem('emisor', '${item.Rfc}')"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}
function renderReceptores(list) {
    const tbody = document.querySelector('#tableReceptores tbody');
    tbody.innerHTML = '';
    (list || []).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.Rfc}</td><td>${item.Name}</td><td>${item.UsoCFDI || 'G03'}</td>
            <td class="text-right"><button class="btn btn-sm btn-danger" onclick="deleteItem('receptor', '${item.Rfc}')"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}
function renderFacturas(list) {
    const tbody = document.querySelector('#tableFacturas tbody');
    tbody.innerHTML = '';
    (list || []).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.folio || 'N/A'}</td>
            <td>${item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '-'}</td>
            <td>${item.receptor}</td>
            <td>$${parseFloat(item.total).toFixed(2)}</td>
            <td><span class="badge">${item.estado_pago || 'Pendiente'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}


function renderNotas(list) {
    const tbody = document.querySelector('#tableNotas tbody');
    tbody.innerHTML = '';
    
    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay notas de crédito registradas</td></tr>';
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        // Formatear fecha si existe
        const fecha = item.fecha_emision ? new Date(item.fecha_emision).toLocaleDateString() : '-';
        const total = parseFloat(item.total).toFixed(2);

        tr.innerHTML = `
            <td>${item.folio || 'S/N'}</td>
            <td>${fecha}</td>
            <td>${item.receptor || ''}</td>
            <td>$${total}</td>
            <td>
                 ${item.pdf_url ? `<a href="${item.pdf_url}" target="_blank" class="btn btn-sm btn-primary"><i class="fas fa-file-pdf"></i></a>` : '-'}
            </td>`;
        tbody.appendChild(tr);
    });
}

function renderComplementos(list) {
    const tbody = document.querySelector('#tableComplementos tbody');
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay complementos de pago registrados</td></tr>';
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        
        // Formateo seguro de montos
        const monto = parseFloat(item.monto || 0).toFixed(2);
        const saldo = parseFloat(item.saldo_insoluto || 0).toFixed(2);
        
        // Formateo de fecha
        let fecha = '-';
        if (item.fecha_pago) {
            try { fecha = new Date(item.fecha_pago).toLocaleDateString(); } catch(e){}
        }

        const uuidRaw = item.uuid_factura || '';
        const uuidCorto = uuidRaw.length > 16 ? uuidRaw.substring(0, 16)  : uuidRaw;
        // -----------------------

        tr.innerHTML = `
            <td>${item.folio_cp || 'S/N'}</td>
            <td title="${item.uuid_factura}">${uuidRaw}</td>
            <td>${fecha}</td>
            <td class="text-success">$${monto}</td>
            <td class="text-danger">$${saldo}</td>
        `;
        tbody.appendChild(tr);
    });
}

// =========================================
// 4. LÓGICA DEL EXTRACTOR PDF (NUEVO DISEÑO)
// =========================================

function setupExtractorListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');

    // Drag & Drop visual effects
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#4361ee';
        uploadArea.style.backgroundColor = 'rgba(67, 97, 238, 0.1)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#e2e8f0';
        uploadArea.style.backgroundColor = '#fafbff';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e2e8f0';
        uploadArea.style.backgroundColor = '#fafbff';
        if (e.dataTransfer.files[0]) handlePDF(e.dataTransfer.files[0]);
    });

    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if(e.target.files[0]) handlePDF(e.target.files[0]);
    });

    // Guardar Emisor
    document.getElementById('emisorForm').addEventListener('submit', saveEmisorData);
}

function handlePDF(file) {
    if (file.type !== 'application/pdf') return showAlert('Solo archivos PDF.', 'error');
    
    document.getElementById('fileName').innerText = file.name;
    document.getElementById('fileName').style.display = 'block';
    
    extractDataFromPDF(file);
}

async function extractDataFromPDF(file) {
    const formData = new FormData();
    formData.append('file', file);

    showLoading(true, 'selectFileBtn'); // Spinner en botón carga

    try {
        const response = await fetch(`${API_URL}/extract-emisor-from-pdf`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error('Error en la extracción');
        const result = await response.json();

        if (result.status === 'success') {
            extractedDataCache = result.data;
            populateForm(extractedDataCache);
            document.getElementById('extractedDataCard').classList.remove('hidden');
            // Scroll suave hacia el formulario
            document.getElementById('extractedDataCard').scrollIntoView({ behavior: 'smooth' });
            showAlert('Datos extraídos correctamente.', 'success');
        } else {
            throw new Error(result.message || 'Error desconocido');
        }
    } catch (error) {
        showAlert('Error al procesar PDF: ' + error.message, 'error');
    } finally {
        showLoading(false, 'selectFileBtn');
    }
}

function populateForm(data) {
    // Básicos
    document.getElementById('rfc').value = data.rfc || '';
    document.getElementById('csd_rfc').value = data.rfc || ''; // Auto-llenar en CSD
    document.getElementById('name').value = data.name || '';
    document.getElementById('zip_code').value = data.zip_code || '';

    // Dirección (Validar existencia)
    const addr = data.address || {};
    document.getElementById('street').value = addr.Street || '';
    document.getElementById('exterior_number').value = addr.ExteriorNumber || '';
    document.getElementById('interior_number').value = addr.InteriorNumber || '';
    document.getElementById('neighborhood').value = addr.Neighborhood || '';
    document.getElementById('city').value = addr.City || addr.Municipality || ''; 
    document.getElementById('state').value = addr.State || '';
    document.getElementById('country').value = addr.Country || 'MX';

    // Listas (Regímenes y Actividades)
    displayList('regimenes-list', data.regimenes_disponibles, 'no-regimenes-msg', 'balance-scale-right');
    displayList('economic-activities', data.economic_activities, 'no-activities-msg', 'chart-line');
}

function displayList(containerId, items, emptyMsgId, icon) {
    const container = document.getElementById(containerId);
    const emptyMsg = document.getElementById(emptyMsgId);
    
    // Limpiar (manteniendo el mensaje vacío oculto)
    Array.from(container.children).forEach(c => { if(c.id !== emptyMsgId) c.remove(); });
    
    if (items && items.length > 0) {
        emptyMsg.style.display = 'none';
        items.forEach(item => {
            const div = document.createElement('div');
            // Clase correcta dependiendo de la lista
            div.className = containerId === 'regimenes-list' ? 'regimen-item' : 'activity-item';
            
            // Texto limpio
            let text = '';
            if (typeof item === 'object' && item !== null) {
                text = item.codigo ? `<strong>${item.codigo}</strong> - ${item.descripcion}` : (item.descripcion || JSON.stringify(item));
            } else {
                text = String(item).replace(/{|}|'/g, '').trim();
            }

            div.innerHTML = `<i class="fas fa-${icon}"></i> <span>${text}</span>`;
            container.appendChild(div);
        });
    } else {
        emptyMsg.style.display = 'block';
    }
}

// Guardar Emisor
async function saveEmisorData(e) {
    e.preventDefault();
    
    // Construir Payload
    const fiscalRegimes = extractedDataCache.regimenes_disponibles || [];
    const payload = {
        phone_number: document.getElementById('phone_number').value,
        rfc: document.getElementById('rfc').value,
        name: document.getElementById('name').value,
        zip_code: document.getElementById('zip_code').value,
        fiscal_regimes: fiscalRegimes.map(r => (typeof r === 'object' && r.codigo) ? r.codigo : r),
        economic_activities: extractedDataCache.economic_activities || [],
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

    showLoading(true, 'saveBtn');
    
    try {
        const response = await fetch(`${API_URL}/save-emisor`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (response.ok) {
            showAlert(result.message || "Emisor guardado correctamente", "success");
            fetchDashboardData(); // Actualizar tabla
        } else {
            throw new Error(result.detail || "Error al guardar");
        }
    } catch (err) {
        showAlert(err.message, "error");
    } finally {
        showLoading(false, 'saveBtn');
    }
}

// =========================================
// 5. SUBIDA DE CSD (XHR PARA PROGRESO)
// =========================================

function setupCSDListener() {
    const csdForm = document.getElementById('csdForm');
    if(!csdForm) return;

    csdForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const rfc = document.getElementById('csd_rfc').value.trim();
        const pwd = document.getElementById('csd_password').value;
        const certFile = document.getElementById('csd_cert').files[0];
        const keyFile = document.getElementById('csd_key').files[0];

        if (!rfc || !pwd || !certFile || !keyFile) return showAlert('Faltan campos CSD', 'error');

        const formData = new FormData();
        formData.append('Rfc_Emisor', rfc);
        formData.append('PrivateKeyPassword', pwd);
        formData.append('Certificate', certFile);
        formData.append('PrivateKey', keyFile);

        // UI Updates
        const btn = document.getElementById('csdUploadBtn');
        const progressDiv = document.getElementById('csdProgress');
        const progressBar = document.getElementById('csdProgressBar');
        const progressText = document.getElementById('csdProgressText');
        const alertsDiv = document.getElementById('csdAlerts');

        btn.disabled = true;
        btn.classList.add('btn-loading');
        progressDiv.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.innerText = '0%';
        alertsDiv.innerHTML = '';

        // XHR Upload
        const xhr = new XMLHttpRequest();
        // NOTA: Asegúrate que la URL sea correcta. Usualmente es /csd_upload o /api/csd_upload
        xhr.open('POST', `${BASE_URL}/csd_upload`, true);

        xhr.upload.onprogress = function(ev) {
            if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 100);
                progressBar.style.width = pct + '%';
                progressText.innerText = pct + '%';
            }
        };

        xhr.onload = function() {
            btn.disabled = false;
            btn.classList.remove('btn-loading');

            let resp = null;
            try { resp = JSON.parse(xhr.responseText); } catch(e){}

            if (xhr.status >= 200 && xhr.status < 300) {
                alertsDiv.innerHTML = `<div class="alert alert-success">${resp?.message || 'CSD Subido Correctamente'}</div>`;
                csdForm.reset();
            } else {
                const msg = resp?.detail || resp?.message || 'Error al subir CSD';
                alertsDiv.innerHTML = `<div class="alert alert-error">${msg}</div>`;
            }
        };

        xhr.onerror = function() {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            alertsDiv.innerHTML = `<div class="alert alert-error">Error de red</div>`;
        };

        xhr.send(formData);
    });
}

// =========================================
// UTILIDADES GENERALES
// =========================================

function showAlert(msg, type) {
    const div = document.getElementById('alerts');
    div.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    setTimeout(() => div.innerHTML = "", 5000);
}

function showLoading(isLoading, btnId) {
    const btn = document.getElementById(btnId);
    if(!btn) return;
    
    if(isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading"></span> Procesando...';
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || 'Aceptar';
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

window.deleteItem = function(type, rfc) {
    if(!confirm('¿Eliminar registro?')) return;
    const endpoint = type === 'receptor' ? '/delete-receptor' : '/delete-emisor';

    authFetch(`${API_URL}${endpoint}`, {
        method: 'POST', 
        body: JSON.stringify({ rfc: rfc }) 
    }).then(() => fetchDashboardData());
};

window.logout = function() {
    if(!confirm("¿Estás seguro de que deseas cerrar sesión?")) return;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('app_uid');
    localStorage.removeItem('app_name');
    
    currentUserUid = null;
    currentUserName = null;
    extractedDataCache = {};

    document.getElementById('app-layout').classList.add('hidden');    
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('landing-page').classList.remove('hidden'); 

    document.getElementById('loginForm').reset();
    document.getElementById('emisorForm').reset();
    
    setTimeout(() => {
        alert("Has cerrado sesión exitosamente.");
    }, 100);
};

function checkAuthStatus() {
    // Usamos authFetch en lugar de fetch normal.
    // Si el token está vencido, authFetch hará logout automáticamente.
    authFetch(`${API_URL}/dashboard/get-data`, { // Usamos el endpoint seguro para probar el token
        method: 'POST', 
        body: JSON.stringify({}) 
    })
    .then(res => {
        if (!res) return; // Si authFetch falló (401), ya hizo logout
        return res.json();
    })
    .then(data => {
        if (data && data.status === 'success') {
            // El token es válido y tenemos datos
            showDashboard();
            loadAllData(data.data);
            if(data.phone) {
                document.getElementById('phone_number').value = data.phone.replace('whatsapp:+521', '');
            }
        }
    })
    .catch(() => {
        // Si hay error de red o cualquier otro, sacamos al usuario
        logout();
    });
}

// =========================================
// FUNCIÓN HELPER PARA PETICIONES SEGURAS
// =========================================
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        console.error("No hay token, redirigiendo a login...");
        logout();
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}` // <--- AQUÍ ESTÁ LA MAGIA
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        alert("Tu sesión ha expirado.");
        logout();
        return null; // Detiene la ejecución
    }

    return response;
}

async function authFetch(url, options = {}) {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        console.warn("No hay token, cerrando sesión local.");
        logout();
        return null;
    }

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}` 
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        console.error("Token rechazado por el servidor (401/403)");
        alert("Tu sesión ha expirado o las credenciales no son válidas.");
        logout(); // Esto recarga la página
        return null; 
    }

    return response;
}