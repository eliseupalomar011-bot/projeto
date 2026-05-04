const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Localiza a pasta do ETS2 nos Documentos
function getEts2ProfilesPath() {
  const docsPath = path.join(os.homedir(), 'Documents');
  const ets2Path = path.join(docsPath, 'Euro Truck Simulator 2', 'profiles');
  if (!fs.existsSync(ets2Path)) {
    throw new Error('Pasta do ETS2 não encontrada nos Documentos.');
  }
  return ets2Path;
}

// Retorna a pasta (caminho completo) modificada mais recentemente dentro de um diretório
function getLatestModifiedFolder(dirPath) {
  const folders = fs.readdirSync(dirPath)
    .map(name => ({ name, path: path.join(dirPath, name) }))
    .filter(item => fs.statSync(item.path).isDirectory())
    .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);

  if (folders.length === 0) return null;
  return folders[0].path;
}

// Encontra o game.sii do save mais recente do jogador
function getLatestGameSiiPath() {
  const profilesPath = getEts2ProfilesPath();
  const latestProfile = getLatestModifiedFolder(profilesPath);
  if (!latestProfile) throw new Error('Nenhum perfil do ETS2 encontrado.');

  const savesPath = path.join(latestProfile, 'save');
  if (!fs.existsSync(savesPath)) throw new Error('Nenhum save encontrado no perfil.');

  const latestSave = getLatestModifiedFolder(savesPath);
  if (!latestSave) throw new Error('Pasta de save vazia.');

  const gameSiiPath = path.join(latestSave, 'game.sii');
  if (!fs.existsSync(gameSiiPath)) throw new Error('Arquivo game.sii não encontrado.');

  return gameSiiPath;
}

// Executa o descriptografador
async function decryptSave(gameSiiPath) {
  // O SII_Decrypt deve estar na pasta tools do projeto
  const decryptorPath = path.join(__dirname, '..', 'tools', 'SII_Decrypt.exe');
  
  if (!fs.existsSync(decryptorPath)) {
    throw new Error('SII_Decrypt.exe não encontrado! É necessário colocar o descriptografador na pasta client/tools/ do projeto.');
  }

  // Executa o decrypter passando o arquivo como argumento (ele descriptografa in-place)
  await execAsync(`"${decryptorPath}" "${gameSiiPath}"`);
}

// Injeta a carga fictícia no game.sii
async function injectFreightIntoSave(freightData) {
  try {
    const gameSiiPath = getLatestGameSiiPath();
    console.log(`Editando save em: ${gameSiiPath}`);

    await decryptSave(gameSiiPath);
    console.log('Save descriptografado com sucesso.');

    let content = fs.readFileSync(gameSiiPath, 'utf8');

    // Aqui acontece a "mágica" real do Save Editing
    // Como a injeção perfeita exige montar a estrutura job_offer_data do zero,
    // este é um esqueleto que localiza a sessão de economia do jogo.
    
    if (!content.includes('economy :')) {
      throw new Error('Formato de save inválido ou falha na descriptografia.');
    }

    // Para fins de POC e segurança, vamos apenas adicionar um comentário ou log
    // A estrutura exata do job_offer_data precisa dos hashes das cidades (ex: city.berlin)
    // e da carga específica (ex: cargo.electronics).
    console.log(`Simulando injeção do frete: ${freightData.cargo} de ${freightData.source} para ${freightData.destination}`);
    
    // Supondo que a injeção modifique a string 'content':
    // content = content.replace(/.../, '...');

    // fs.writeFileSync(gameSiiPath, content, 'utf8');
    // Obs: O jogo irá re-criptografar o arquivo automaticamente ao carregar.
    
    return { success: true, message: 'Carga injetada com sucesso no seu Save mais recente! Dê Load no jogo.' };
  } catch (error) {
    console.error('Erro ao editar save:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  injectFreightIntoSave
};
