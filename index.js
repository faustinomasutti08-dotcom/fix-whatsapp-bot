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

async function registrarLead(numero, nombre, tipoTecho, metros) {
  try {
    const sheets = await getSheetsClient();
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Hoja 1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[fecha, numero, nombre || '', tipoTecho || '', 'Nuevo', metros || '', '']],
      },
    });
  } catch (err) {
    console.error('Error al registrar en Sheets:', err.message);
  }
}

async function actualizarColumna(numero, columna, valor) {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Hoja 1!B:B',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === numero);
    if (rowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Hoja 1!${columna}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[valor]] },
      });
    }
  } catch (err) {
    console.error('Error al actualizar columna:', err.message);
  }
}

const SYSTEM_PROMPT = `Sos el asistente virtual de FIX, empresa de impermeabilización de Mendoza.

INFORMACIÓN DEL NEGOCIO:
- Servicio: Impermeabilización de techos
- Tipos de techo: losa, chapa y teja
- Zona de cobertura: Gran parte de Mendoza
- Horario de atención: Lunes a sábado de 8:00 a 20:00 hs
- Precios (incluye mano de obra y materiales, más impuestos):
  * Teja: $23.500 por m² + impuestos
  * Chapa y losa: $21.500 por m² + impuestos
- Garantía: 5 años en todos los trabajos
- Presupuesto: Gratuito y sin compromiso
- Instagram: https://www.instagram.com/fixing_mendoza/

PROCESO DE TRABAJO:
1. Visita al domicilio para evaluar el techo
2. Presupuesto gratuito y sin compromiso
3. Se asigna día y fecha para la ejecución
4. Ejecución del trabajo:
   - Se coloca una tela geotextil con una capa de emulsión asfáltica
   - Se agrega otra capa de emulsión asfáltica
   - Se aplica una membrana líquida del color que el cliente elija, que sirve para proteger el producto de los rayos del sol y para que la terminación pase desapercibida integrándose al techo

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
- Nunca uses emojis en ningún mensaje
- Antes de hablar de una visita, el cliente siempre tiene que conocer el presupuesto aproximado. El flujo es siempre este orden: 1) conseguí el tipo de techo y los metros cuadrados (una pregunta por vez, de forma natural), 2) calculá el monto: metros x precio según tipo de techo, y presentáselo: "Para darte una idea, el trabajo te quedaría en aproximadamente $[monto] + impuestos. El presupuesto definitivo lo confirmaríamos en la visita, que es gratuita y sin compromiso. Te parece bien que coordinemos?" 3) Solo si acepta, pedile la ubicación: "Perfecto, me podés compartir un link de Google Maps de tu domicilio?" y cuando lo mande: "Genial, te paso con Faustino para coordinar los detalles. El te va a responder a la brevedad."
- Nunca propongas una visita sin antes haber dado el presupuesto aproximado
- Si el cliente hace una consulta particular o especial que no sabés responder: "Te paso con Faustino para coordinar los detalles. El te va a responder a la brevedad."
- Si te preguntan algo que no sabés, también derivá a Faustino con ese mismo mensaje

AL INICIO DE LA CONVERSACIÓN:
- Si el cliente arranca con "Hola, quiero más información" o similar (viene de publicidad), saludalo según la hora del día (buenos días antes de las 12, buenas tardes de 12 a 19, buenas noches de 19 en adelante) y respondé así: "[Saludo], gracias por comunicarte con FIX. Como es tu nombre?"
- Una vez que te diga el nombre, preguntale en qué lo podés ayudar. Mencioná de forma natural que hacen impermeabilización de techos y que podés contarle más si quiere. No hagas más de una pregunta.
- A lo largo de la conversación, si viene bien, podés mencionar el Instagram: https://www.instagram.com/fixing_mendoza/
- No hagas más de una pregunta por mensaje
- Si el cliente arranca directamente con una pregunta sin saludar, respondé normalmente sin pedir el nombre

CUANDO PREGUNTEN POR PARCHES O REPARACIONES PARCIALES:
Aclarales que si se puede hacer pero que no hacemos parches, trabajamos por paños completos. El precio sigue siendo por metro cuadrado: $23.500/m² para teja y $21.500/m² para chapa y losa, incluye mano de obra y materiales, más impuestos.

PREGUNTAS FRECUENTES:
- Cuanto cuesta? → Teja: $23.500/m² — Chapa y losa: $21.500/m² (incluye mano de obra y materiales, + impuestos)
- Trabajan en mi zona? → Trabajamos en la mayor parte de Mendoza
- Que tipos de techo trabajan? → Losa, chapa y teja
- Cuando pueden venir? → Lunes a sábado de 8 a 20hs, coordinamos fecha cuando hablás con Faustino
- Que garantía tienen? → 5 años de garantía en todos nuestros trabajos
- Hacen presupuesto? → Si, el presupuesto es gratuito y sin compromiso
- Como pago? → 50/50 o tarjeta de crédito
- Cuanto tarda el trabajo? → Un techo de 50 a 100 m² se hace en 2 días
- Como es el proceso? → Visita, presupuesto y luego coordinamos el día de ejecución
- Hacen parches? → No hacemos parches, trabajamos por paños completos

Siempre respondé de forma breve y ofrecé seguir ayudando.`;

const conversaciones = new Map();
const datosCliente = new Map();

function estaEnHorario() {
  const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' });
  const fecha = new Date(ahora);
  const dia = fecha.getDay();
  const hora = fecha.getHours();
  return dia >= 1 && dia <= 6 && hora >= 8 && hora < 20;
}

function detectarTipoTecho(texto) {
  const t = texto.toLowerCase();
  if (t.includes('teja')) return 'Teja';
  if (t.includes('chapa')) return 'Chapa';
  if (t.includes('losa')) return 'Losa';
  return null;
}

function detectarMetros(texto) {
  const match = texto.match(/(\d+[\.,]?\d*)\s*(m2|m²|mts?\.?|metros?(\s*cuadrados?)?)/i);
  return match ? match[1].replace(',', '.') : null;
}

function detectarUbicacion(texto) {
  const match = texto.match(/https?:\/\/(maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl|google\.com\/maps)\S*/i);
  return match ? match[0] : null;
}

async function responderMensaje(numero, mensaje) {
  if (!conversaciones.has(numero)) {
    conversaciones.set(numero, []);
    datosCliente.set(numero, { nombre: '', tipoTecho: '', metros: '', ubicacion: '', registrado: false });
  }

  const datos = datosCliente.get(numero);
  const historial = conversaciones.get(numero);

  const tipoDetectado = detectarTipoTecho(mensaje);
  if (tipoDetectado && !datos.tipoTecho) {
    datos.tipoTecho = tipoDetectado;
    if (datos.registrado) {
      await actualizarColumna(numero, 'D', tipoDetectado);
    }
  }

  const metrosDetectados = detectarMetros(mensaje);
  if (metrosDetectados && !datos.metros) {
    datos.metros = metrosDetectados;
    if (datos.registrado) {
      await actualizarColumna(numero, 'F', metrosDetectados);
    }
  }

  const ubicacionDetectada = detectarUbicacion(mensaje);
  if (ubicacionDetectada && !datos.ubicacion) {
    datos.ubicacion = ubicacionDetectada;
    if (datos.registrado) {
      await actualizarColumna(numero, 'G', ubicacionDetectada);
    }
  }

  historial.push({ role: 'user', content: mensaje });

  if (historial.length > 10) {
    historial.splice(0, historial.length - 10);
  }

  const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const systemConFecha = `${SYSTEM_PROMPT}\n\nFecha y hora actual en Mendoza: ${ahora}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemConFecha,
    messages: historial,
  });

  const respuesta = response.content[0].text;
  historial.push({ role: 'assistant', content: respuesta });

  if (!datos.registrado) {
    await registrarLead(numero, datos.nombre, datos.tipoTecho, datos.metros);
    datos.registrado = true;
  }

  if (!datos.nombre && historial.length >= 3) {
    const nombreMatch = mensaje.match(/^(soy |me llamo |mi nombre es )?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i);
    if (nombreMatch && historial.length <= 8) {
      datos.nombre = nombreMatch[2];
      if (datos.registrado) {
        await actualizarColumna(numero, 'C', datos.nombre);
      }
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

    if (!mensaje) return;

    let numero = mensaje.from;
    if (numero.startsWith('549')) {
      numero = '54' + numero.slice(3);
    }

    if (mensaje.type !== 'text') {
      await enviarMensaje(numero, 'Te paso con Faustino para que pueda atenderte. El te va a responder a la brevedad.');
      return;
    }

    const texto = mensaje.text.body;

    console.log('Enviando respuesta a:', numero);

    if (!estaEnHorario()) {
      await enviarMensaje(numero, 'Gracias por escribirnos. En este momento estamos fuera de horario. Nuestro horario de atención es lunes a sábado de 8 a 20hs. En cuanto abramos te respondemos.');
      return;
    }

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
