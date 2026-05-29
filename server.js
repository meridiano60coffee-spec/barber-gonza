const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Módulo nativo para manejo de archivos con Promesas
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

// Ruta física del archivo donde se guardará la base de datos JSON
const ARCHIVO_DB = path.join(__dirname, 'turnos.json');

// --- CONFIGURACIÓN DE WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});
client.on('qr', async (qr) => {
    console.log("Motor de WhatsApp esperando vinculación remota...");
});
client.on('ready', () => { console.log('✅ WhatsApp listo.'); });
client.initialize();
// ----------------------------------

// Variable en memoria que se sincronizará con el archivo JSON
let turnosSimulados = [];

/**
 * Función auxiliar: Carga los turnos del archivo JSON al iniciar el servidor
 */
async function cargarBaseDeDatos() {
    try {
        // Verificar si el archivo ya existe antes de leerlo
        await fs.access(ARCHIVO_DB);
        const data = await fs.readFile(ARCHIVO_DB, 'utf-8');
        turnosSimulados = JSON.parse(data);
        console.log(`📦 Base de datos cargada. Turnos totales registrados: ${turnosSimulados.length}`);
    } catch (error) {
        // Si el archivo no existe, lo inicializa con un array vacío
        console.log("🗃️ No se encontró el archivo turnos.json. Creando base de datos nueva...");
        await fs.writeFile(ARCHIVO_DB, JSON.stringify([], null, 2), 'utf-8');
        turnosSimulados = [];
    }
}

// Invocación inmediata para poblar la memoria al arrancar la app
cargarBaseDeDatos();

// RUTA 1: Consultar turnos ocupados
app.get('/api/turnos-ocupados', (req, res) => {
    const { fecha } = req.query;
    const ocupados = turnosSimulados.filter(t => t.fecha === fecha).map(t => t.hora);
    res.json(ocupados);
});

// RUTA 2: Iniciar intención de reserva (Validación previa)
app.post('/api/iniciar-pago', (req, res) => {
    const { fecha, hora } = req.body;
    
    const existe = turnosSimulados.some(t => t.fecha === fecha && t.hora === hora);
    if (existe) {
        return res.status(400).json({ error: "Este horario ya fue tomado hace instantes." });
    }
    
    const idPreferenciaSimulado = "MP-" + Math.floor(Math.random() * 900000 + 100000);
    res.json({ idPreferencia: idPreferenciaSimulado });
});

// Esta es la ruta secreta a la que Mercado Pago llamará cuando alguien pague
app.post('/webhook', async (req, res) => {
    try {
        // 1. Recibimos la información que nos manda la API
        const { query } = req;
        const topic = query.topic || query.type;
        const idTransaccion = query.id || query['data.id'];

        // 2. Verificamos que sea una notificación de un pago
        if (topic === 'payment' && idTransaccion) {
            
            // Aquí iría el código para preguntarle a la API si el pago fue exitoso
            // const estadoPago = await consultarAPI(idTransaccion);

            // SIMULACIÓN: Si el pago fue aprobado, actualizamos nuestra base de datos
            const pagoAprobado = true; 

            if (pagoAprobado) {
                console.log(`¡Pago ${idTransaccion} recibido! Actualizando turno...`);
                
                // 3. Lógica para confirmar el turno automáticamente
                // Ejemplo: BaseDeDatos.Turnos.marcarComoConfirmado(idTransaccion);
                
                // 4. Lógica para disparar el mensaje de WhatsApp al cliente
                // Ejemplo: enviarWhatsAppConfirmacion();
            }
        }

        // 5. ¡IMPORTANTE! Siempre debemos responderle "200 OK" a la API 
        // para que sepa que recibimos su mensaje, sino lo seguirá enviando.
        res.status(200).send("Notificación recibida");

    } catch (error) {
        console.error("Error en el webhook:", error);
        res.status(500).send("Error interno del servidor");
    }
});

// Iniciamos el servidor en el puerto 3000
app.listen(3000, () => {
    console.log('Servidor escuchando notificaciones en el puerto 3000');
});

// RUTA 3: Confirmación de pago y Escritura persistente
app.post('/api/confirmar-pago-exitoso', async (req, res) => {
    const { nombre, telefono, fecha, hora, servicio } = req.body;
    
    // Doble verificación de concurrencia leyendo el estado actual de la memoria
    const existe = turnosSimulados.some(t => t.fecha === fecha && t.hora === hora);
    if (existe) {
        return res.status(400).json({ error: "Error: El horario se ocupó durante el proceso de pago." });
    }
    
    // Estructura del nuevo registro
    const nuevoTurno = { 
        id: "T-" + Date.now(), // ID único basado en timestamp
        nombre, 
        telefono, 
        fecha, 
        hora, 
        servicio, 
        estado_pago: 'Pagado (Seña)',
        fecha_registro: new Date().toISOString()
    };
    
    // 1. Modificar el estado de la variable en memoria
    turnosSimulados.push(nuevoTurno);
    
    try {
        // 2. Operación de persistencia: Escribir el array completo estructurado en el archivo físico
        // El parámetro 'null, 2' asegura un formato legible dentro del JSON
        await fs.writeFile(ARCHIVO_DB, JSON.stringify(turnosSimulados, null, 2), 'utf-8');
        console.log("💾 Archivo turnos.json actualizado con éxito en disco.");
        
        // 3. Envío del mensaje de WhatsApp estructurado
        const numeroLimpiado = telefono.replace(/\D/g, ''); 
        const chatId = `549${numeroLimpiado}@c.us`; 
        const mensajeWa = `¡Hola ${nombre}! 👋\n\nTe confirmamos que recibimos el pago de tu seña 💈.\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora} hs\n✂️ Servicio: ${servicio}\n\n¡Tu lugar ya está reservado! Nos vemos.`;
        
        await client.sendMessage(chatId, mensajeWa);
        console.log(`WhatsApp enviado correctamente a ${nombre}`);
        
        res.json({ estatus: "OK", mensaje: "Turno agendado y guardado con persistencia." });
        
    } catch (error) {
        console.error("Error crítico en la persistencia o envío:", error);
        res.status(500).json({ error: "Error interno del servidor al procesar el guardado." });
    }
});

app.listen(3000, () => { console.log('Servidor en ejecución en http://localhost:3000'); });