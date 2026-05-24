const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SPREADSHEET_ID = '197INTKLBzr94Js87ln-K0bskbRygAPmLjc2EjjBsoJo';

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function registrarLead(numero, nombre, primerMensaje, tipoTecho) {
  try {
    const sheets = await getSheetsClient();
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Hoja1!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[fecha, numero, nombre || '', primerMensaje, tipoTecho || '', 'Nuevo']],
      },
    });
  } catch (err) {
    console.error('Error al registrar en Sheets:', err.message);
  }
}

async function actualizarTipoTecho(numero, tipoTecho) {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Hoja1!B:E',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === numero);
    if (rowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Hoja1!E${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[tipoTecho]] },
      });
    }
  } catch (err) {
    console.error('Error al actualizar tipo de techo:', err.message);
  }
}

const SYSTEM_PROMPT = `Sos el asistente virtual de FIX, empresa de impermeabilización de Mendoza.

INFORMACIÓN DEL NEGOCIO:
- Servicio: Impermeabilización de techos
- Tipos de techo: losa, chapa y teja
- Zona de cobertura: Gran parte de Mendoza
- Horario de atención: Lunes a sábado de 8:00 a 20:00 hs
- Precios (incluye mano de obra y materiales):
  * Teja: $23.500 por m²
  * Chapa y losa: $21.500 por m²
- Garantía: 3 años en todos los trabajos
- Presupuesto: Gratuito y sin compromiso
- Instagram: https://www.instagram.com/fixing_mendoza/

PROCESO DE TRABAJO:
1. Visita al domicilio para evaluar el techo
2. Presupuesto gratuito y sin compromiso
3. Se asigna día y fecha para la ejecución
4. Ejecución del trabajo:
   - Se coloca una tela geotextil con una capa de emulsión asfáltica
   - Se agrega otra capa de emulsión asfáltica
   - Se aplica una membrana líquida del color que el cliente elija (para que pase desapercibida)

TIEMPOS DE TRABAJO:
- Un techo de entre 50 y 100 m² se termina en aproximadamente 2 días

FORMAS DE PAGO:
- 50% al iniciar el trabajo y 50% al finalizar
- Tarjeta de crédito

CÓMO RESPONDÉS:
- Sos amable, claro y directo
- Respondés en español argentino, tuteás al cliente
- Usás el nombre del cliente cuando lo sabés
- Nunca inventás información que no tenés
- Cuando el cliente quiere cerrar el trabajo, pedir una visita, o hacer una consulta particular o especial, respondé exactamente esto: "Te paso con Faustino para coordinar los detalles. Él te va a responder a la brevedad 🙌"
- Si te preguntan algo que no sabés, también derivá a Faustino con ese mismo mensaje

AL INICIO DE LA CONVERSACIÓN:
- Si el cliente arranca con "Hola, quiero más información" o similar (viene de publicidad), primero preguntale su nombre: "¡Hola! 👋 Bienvenido a FIX, impermeabilización profesional en Mendoza. ¿Cómo te llamás?"
- Una vez que te diga el nombre, respondé: "¡Buenísimo, [nombre]! Para darte el precio exacto, ¿qué tipo de techo tenés? 🏠 Teja, chapa o losa. También podés ver nuestros trabajos en Instagram: https://www.instagram.com/fixing_mendoza/"
- Si el cliente arranca directamente con una pregunta sin saludar, respondé normalmente sin pedir el nombre.

CUANDO PREGUNTEN POR PARCHES O REPARACIONES PARCIALES:
Aclarales que SÍ se puede hacer pero que nosotros no hacemos parches — trabajamos por paños completos. El precio sigue siendo por metro cuadrado: $23.500/m² para teja y $21.500/m² para chapa y losa, incluye mano de obra y materiales.

PREGUNTAS FRECUENTES:
- ¿Cuánto cuesta? → Teja: $23.500/m² — Chapa y losa: $21.500/m² (incluye mano de obra y materiales)
- ¿Trabajan en mi zona? → Trabajamos en la mayor parte de Mendoza
- ¿Qué tipos de techo trabajan? → Losa, chapa y teja
- ¿Cuándo pueden venir? → Lunes a sábado de 8 a 20hs, coordinamos fecha cuando hablás con Faustino
- ¿Qué garantía tienen? → 3 años de garantía en todos nuestros trabajos
- ¿Hacen presupuesto? → Sí, el presupuesto es gratuito y sin compromiso
- ¿Cómo pago? → 50/50 o tarjeta de crédito
- ¿Cuánto tarda el trabajo? → Un techo de 50 a 100 m² se hace en 2 días
- ¿Cómo es el proceso? → Visita, presupuesto y luego coordinamos el día de ejecución
- ¿Hacen parches? → No hacemos parches, trabajamos por paños completos

Siempre respondé de forma breve y ofrecé seguir ayudando.`;

const conversaciones = new Map();
const datosCliente = new Map();

function detectarTipoTecho(texto) {
  const t = texto.toLowerCase();
  if (t.includes('teja')) return 'Teja';
  if (t.includes('chapa')) return 'Chapa';
  if (t.includes('losa')) return 'Losa';
  return null;
}

async function responderMensaje(numero, mensaje) {
  if (!conversaciones.has(numero)) {
    conversaciones.set(numero, []);
    datosCliente.set(numero, { nombre: '', primerMensaje: mensaje, tipoTecho: '', registrado: false });
  }

  const datos = datosCliente.get(numero);
  const historial = conversaciones.get(numero);

  const tipoDetectado = detectarTipoTecho(mensaje);
  if (tipoDetectado && !datos.tipoTecho) {
    datos.tipoTecho = tipoDetectado;
    if (datos.registrado) {
      await actualizarTipoTecho(numero, tipoDetectado);
    }
  }

  historial.push({ role: 'user', content: mensaje });

  if (historial.length > 10) {
    historial.splice(0, historial.length - 10);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: historial,
  });

  const respuesta = response.content[0].text;
  historial.push({ role: 'assistant', content: respuesta });

  if (!datos.registrado) {
    await registrarLead(numero, datos.nombre, datos.primerMensaje, datos.tipoTecho);
    datos.registrado = true;
  }

  if (!datos.nombre) {
    const nombreMatch = mensaje.match(/^(soy |me llamo |mi nombre es )?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
    if (nombreMatch && historial.length <= 4) {
      datos.nombre = nombreMatch[2];
    }
  }

  return respuesta;
}

async function enviarMensaje(numero, texto) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const mensaje = entry?.changes?.[0]?.value?.messages?.[0];

    if (!mensaje || mensaje.type !== 'text') return;

    let numero = mensaje.from;
    if (numero.startsWith('549')) {
      numero = '54' + numero.slice(3);
    }
    const texto = mensaje.text.body;

    console.log('Enviando respuesta a:', numero);
    const respuesta = await responderMensaje(numero, texto);
    await enviarMensaje(numero, respuesta);
  } catch (error) {
    console.error('Error procesando mensaje:', error.message);
    if (error.response) {
      console.error('Detalle:', JSON.stringify(error.response.data));
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot FIX activo en puerto ${PORT}`));
