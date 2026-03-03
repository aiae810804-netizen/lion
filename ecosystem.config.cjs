module.exports = {
apps : [{
name : "mes-app",
script : "./server/index.js",
env: {
NODE_ENV: "production",
PORT: 3000,
// Puedes poner las credenciales aquí o leerlas del .env
DB_USER:"lionuser",
DB_PASSWORD:"lionu5er",
DB_SERVER:"192.168.0.19\\SQLEXPRESS",
DB_NAME:"liondb"

}
}]
} 