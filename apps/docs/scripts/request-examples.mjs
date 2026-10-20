const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const placeholder = name => '<' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '>';
const headerName = name => {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error('Invalid header parameter name');
  return name;
};

/** Render each security alternative independently; never infer authority from a URL. */
export function requestExamples({ route, method, parameters, security, schemes, mediaType, resolve }) {
  return (security.length ? security : [{}]).map(requirement => {
    const command = ['curl --fail-with-body -X ' + method.toUpperCase() + ' "$NIU_ORIGIN' + route + '"'];
    const headers = new Set();
    const queries = new Set();
    const cookies = [];
    for (const name of Object.keys(requirement)) {
      const scheme = resolve(schemes[name]);
      if (!scheme) throw new Error(`Undefined security scheme ${name}`);
      if (scheme.type === 'http' && scheme.scheme.toLowerCase() === 'bearer') {
        const variable = name === 'adminBearerAuth' ? 'NIU_ADMIN_TOKEN'
          : name === 'operatorBearer' ? 'NIU_MEMBER_TOKEN' : 'NIU_BEARER_TOKEN';
        command.push(`  -H "Authorization: Bearer $${variable}"`);
        headers.add('authorization');
      } else if (scheme.type === 'apiKey' && scheme.in === 'header') {
        command.push(`  -H "${headerName(scheme.name)}: $NIU_API_KEY"`);
        headers.add(scheme.name.toLowerCase());
      } else if (scheme.type === 'apiKey' && scheme.in === 'cookie') {
        if (!/^[A-Za-z0-9_-]+$/.test(scheme.name)) throw new Error('Invalid cookie name');
        cookies.push(`${scheme.name}=$NIU_MEMBER_SESSION`);
      } else if (scheme.type === 'apiKey' && scheme.in === 'query') {
        command.push(`  --url-query "${encodeURIComponent(scheme.name)}=$NIU_API_KEY"`);
        queries.add(scheme.name);
      } else {
        throw new Error(`Unsupported example security scheme ${name}`);
      }
    }
    if (cookies.length) command.push(`  --cookie "${cookies.join('; ')}"`);
    for (const parameter of parameters) {
      if (!parameter.required) continue;
      if (parameter.in === 'query' && !queries.has(parameter.name)) {
        command.push('  --url-query ' + quote(encodeURIComponent(parameter.name) + '=' + placeholder(parameter.name)));
      }
      if (parameter.in === 'header' && !headers.has(parameter.name.toLowerCase())
          && !(parameter.name.toLowerCase() === 'content-type' && mediaType)) {
        command.push('  -H ' + quote(headerName(parameter.name) + ': ' + placeholder(parameter.name)));
      }
    }
    if (mediaType) command.push('  -H ' + quote('Content-Type: ' + mediaType),
      mediaType === 'application/json' ? '  --data @request.json' : '  --data-binary @request-body');
    return { schemes: Object.keys(requirement), command: command.join(' \\\n') };
  });
}
