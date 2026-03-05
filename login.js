const form = document.getElementById("loginForm")

form.addEventListener("submit", function(e){

e.preventDefault()

const usuario = document.getElementById("usuario").value
const senha = document.getElementById("senha").value

const userCorreto = "admin"
const senhaCorreta = "1234"

const btn = document.querySelector(".btn-login")

if(usuario === userCorreto && senha === senhaCorreta){

localStorage.setItem("barberLogado", "true")

btn.classList.add("success","loading")

setTimeout(() => {

document.body.classList.add("fade-out")

setTimeout(()=>{
window.location.href = "dashboard.html"
},400)

},1000)

}else{

const erro = document.getElementById("erroLogin")

erro.innerText = "Usuário ou senha inválidos"

erro.classList.remove("erro-animado")
void erro.offsetWidth
erro.classList.add("erro-animado")

}

})

/* MOSTRAR / OCULTAR SENHA */

const senhaInput = document.getElementById("senha")
const senhaGroup = document.querySelector(".senha-group")
const toggleSenha = document.querySelector(".toggle-senha")

senhaInput.addEventListener("input", () => {

if(senhaInput.value.length > 0){
senhaGroup.classList.add("show-eye")
}else{
senhaGroup.classList.remove("show-eye")
}

})

toggleSenha.addEventListener("click", () => {

if(senhaInput.type === "password"){
senhaInput.type = "text"
toggleSenha.innerHTML = '<i class="fas fa-eye-slash"></i>'
}else{
senhaInput.type = "password"
toggleSenha.innerHTML = '<i class="fas fa-eye"></i>'
}

})

/* PARTICULAS */

const canvas = document.getElementById("particles")
const ctx = canvas.getContext("2d")

canvas.width = window.innerWidth
canvas.height = window.innerHeight

let particles = []

for(let i=0;i<60;i++){
particles.push({
x:Math.random()*canvas.width,
y:Math.random()*canvas.height,
r:Math.random()*2,
dx:(Math.random()-0.5)*0.5,
dy:(Math.random()-0.5)*0.5
})
}

function animate(){

ctx.clearRect(0,0,canvas.width,canvas.height)

particles.forEach(p=>{

ctx.beginPath()
ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
ctx.fillStyle="rgba(0,240,255,0.5)"
ctx.fill()

p.x+=p.dx
p.y+=p.dy

if(p.x<0||p.x>canvas.width)p.dx*=-1
if(p.y<0||p.y>canvas.height)p.dy*=-1

})

requestAnimationFrame(animate)

}

animate()