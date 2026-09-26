'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LIMITES = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'modelos', 'limites.json'), 'utf8')); }
  catch (e) { return { delegaveisConhecidos: [] }; }
})();

function lerJson(arquivo) {
  try { const o = JSON.parse(fs.readFileSync(arquivo, 'utf8')); return o && typeof o === 'object' ? o : null; }
  catch (e) { return null; }
}

function subpastas(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory(); })
      .map(function (e) { return e.name; });
  } catch (e) { return []; }
}

function arquivosMd(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (e) { return e.isFile() && e.name.endsWith('.md'); })
      .map(function (e) { return e.name.replace(/\.md$/, ''); });
  } catch (e) { return []; }
}

/**
 * Decisao 3 de pre-sessao: nucleo proprio + DETECCAO.
 * O que ja existe no projeto nao se duplica: delega-se, ou deixa-se em paz.
 */
function detectar(cwd) {
  const base = path.join(cwd, '.claude');
  const settings = lerJson(path.join(base, 'settings.json')) || {};
  const local = lerJson(path.join(base, 'settings.local.json')) || {};

  const plugins = Object.keys(
    Object.assign({}, settings.enabledPlugins || {}, local.enabledPlugins || {})
  );

  const hooks = Object.keys(
    Object.assign({}, (settings.hooks || {}), (local.hooks || {}))
  );

  const mcpArquivo = lerJson(path.join(cwd, '.mcp.json')) || {};
  const mcp = Object.keys(mcpArquivo.mcpServers || mcpArquivo || {}).filter(function (k) { return k !== 'mcpServers'; });

  const delegaveis = [];
  for (const d of (LIMITES.delegaveisConhecidos || [])) {
    const achou = plugins.some(function (p) { return p.indexOf(d.nome) === 0; }) ||
                  mcp.some(function (m) { return m.indexOf(d.nome) !== -1; });
    if (achou) delegaveis.push(d.nome + ': ' + d.delega);
  }

  return {
    plugins: plugins,
    skills: subpastas(path.join(base, 'skills')),
    agentes: arquivosMd(path.join(base, 'agents')),
    hooks: hooks,
    mcp: mcp,
    delegaveis: delegaveis
  };
}

module.exports = { LIMITES, detectar };
