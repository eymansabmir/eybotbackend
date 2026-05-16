const { parentPort, workerData } = require('worker_threads');

try {
  const { regex, text } = workerData;
  const re = new RegExp(regex);
  const result = re.test(text);
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
