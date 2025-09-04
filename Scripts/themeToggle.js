const themeToggle = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

if (localStorage.getItem('theme') === 'dark') {
    htmlEl.classList.add('dark');
    themeToggle.textContent = "☀️ Light";
}

themeToggle.addEventListener('click', () => {
    htmlEl.classList.toggle('dark');
    const isDark = htmlEl.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
});