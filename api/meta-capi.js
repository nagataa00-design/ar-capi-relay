const crypto = require('crypto');                                                           

  const PIXEL_ID    = '1805716564172576';
  const API_VERSION = 'v19.0';
  const CAPI_URL    = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

  function h(value) {                              
    if (!value) return undefined;
    return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
  }                                                                                           
  function hPhone(value) {                         
    if (!value) return undefined;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return undefined;
    return crypto.createHash('sha256').update(digits).digest('hex');
  }
  function arr(v) { return v ? [v] : undefined; }                                             

  module.exports = async function handler(req, res) {
    const allowedOrigins = ['https://anatomyrelief.com','https://mqyjht-02.myshopify.com'];
    const origin = req.headers['origin'];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();                               
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = process.env.META_CAPI_TOKEN;                                                
    if (!token) return res.status(500).json({ error: 'Server misconfiguration' });

    try {                                                                                     
      const { event_name, event_id, event_source_url, user_data = {}, custom_data = {}, action_source = 'website',
  test_event_code } = req.body;
      if (!event_name) return res.status(400).json({ error: 'event_name is required' });      

      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
      const clientUa = user_data.client_user_agent || req.headers['user-agent'] || null;      

      const ud = {
        client_ip_address: clientIp || undefined,                                             
        client_user_agent: clientUa || undefined,
        fbp: user_data.fbp || undefined,
        fbc: user_data.fbc || undefined,
      };
      if (user_data.em)      ud.em      = arr(h(user_data.em));                               
      if (user_data.ph)      ud.ph      = arr(hPhone(user_data.ph));
      if (user_data.fn)      ud.fn      = arr(h(user_data.fn));
      if (user_data.ln)      ud.ln      = arr(h(user_data.ln));
      if (user_data.ct)      ud.ct      = arr(h(user_data.ct));
      if (user_data.st)      ud.st      = arr(h(user_data.st));
      if (user_data.zp)      ud.zp      = arr(h(user_data.zp));
      if (user_data.country) ud.country = arr(h(user_data.country));

      const eventPayload = {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: event_source_url || undefined,                                      
        event_id: event_id || undefined,           
        action_source,
        user_data: ud,
      };
      if (custom_data && Object.keys(custom_data).length > 0) eventPayload.custom_data = custom_data;

      const body = { data: [eventPayload] };       
      if (test_event_code) body.test_event_code = test_event_code;
  
      const metaRes = await fetch(`${CAPI_URL}?access_token=${token}`, {
        method: 'POST',                            
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });                                                                                     
      const result = await metaRes.json();         
      if (!metaRes.ok) return res.status(metaRes.status).json({ error: result });
      return res.status(200).json({ ok: true, events_received: result.events_received });

    } catch (err) {
      return res.status(500).json({ error: 'Internal error' });
    }
  };
