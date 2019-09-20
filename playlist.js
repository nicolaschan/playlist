// HELPER ABSTRACTIONS

function get (path) {
  const request = new XMLHttpRequest()
  request.open('GET', path)
  request.send()
  return new Promise((resolve, reject) => {
    request.onload = () => {
      resolve({
        'Content-Type': request.getResponseHeader('Content-Type'),
        body: request.responseText
      })
    }
  })
}

function byId (id) {
  return document.getElementById(id)
}

function hide (id) {
  return byId(id).style.display = 'none'
}

function onKey (key, f) {
  return function (e) {
    // https://stackoverflow.com/a/2167725
    let target = e.target
    let targetTagName = (target.nodeType == 1) ? target.nodeName.toUpperCase() : "";
    if (!/INPUT|SELECT|TEXTAREA/.test(targetTagName) && e.keyCode == key) {
      f(e)
    }
  }
}

function clearChildren (elem) {
  while (elem && elem.firstChild) {
    elem.removeChild(elem.firstChild)
  }
}

function setChildren (elem, children) {
  clearChildren(elem)
  for (const child of children) {
    elem.appendChild(child)
  }
}

function shuffle (arr) {
  for (let i = 0; i < arr.length; i++) {
    const randomIndex = Math.floor(Math.random() * arr.length)
    const temp = arr[i]
    arr[i] = arr[randomIndex]
    arr[randomIndex] = temp
  }
}


// KEYBOARD SHORTCUTS
function togglePause (video) {
  if (video.paused) {
    video.play()
  } else {
    video.pause()
  }
}

function seekByTimeFn (seconds) {
  // Returns a function that seeks video by seconds
  return function (video) {
    let newTime = Math.min(Math.max(0, video.currentTime + seconds), video.duration)
    video.currentTime = newTime
    return newTime
  }
}

// These are automatically attached in loadPlaylist
const SHORTCUTS = Object.freeze({
  74: seekByTimeFn(-10), // qwerty "j"
  75: togglePause, // qwerty "k"
  76: seekByTimeFn(10), // qwerty "l"
});

// MAIN

function createVideo (src) {
  const video = document.createElement('video')
  const source = document.createElement('source')
  source.src = src
  video.autoplay = true
  video.controls = true
  video.height = 360 
  video.volume = localStorage.getItem('volume') || 1
  video.appendChild(source)
  return video
}

function playVideo (src) {
  const mediaPlayer = byId('media-player')
  const video = createVideo(src)
  setChildren(mediaPlayer, [video])
  return video
}

function createTable (paths, playlist, currentIndex) {
  const table = document.createElement('table')
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    const row = document.createElement('tr')
    row.style = 'cursor: pointer;' + ((i == currentIndex) ? 'font-weight:700;color:blue;' : '')
    const index = document.createElement('td')
    index.appendChild(document.createTextNode(i))
    row.appendChild(index)
    const pathCol = document.createElement('td')
    pathCol.appendChild(document.createTextNode(unescape(path)))
    row.appendChild(pathCol)
    row.addEventListener('click', e => playlist(i))
    table.appendChild(row)
  }
  return table
}

function showTable (paths, playlist, currentIndex) {
  const wrapper = byId('playlist-table-wrapper')
  setChildren(wrapper, [createTable(paths, playlist, currentIndex)])
}

function handleVolumeChange (evt) {
  const volume = evt.target.volume
  localStorage.setItem('volume', volume)
}

function createPlaylist (paths) {
  let currentIndex = 0 

  function playlist (index) {
    if (index < 0 || index >= paths.length) { return false }
    currentIndex = index
    const currentSong = byId('current-song')
    clearChildren(currentSong)
    currentSong.appendChild(document.createTextNode(unescape(paths[index])))

    const currentIndexElement = byId('current-index')
    clearChildren(currentIndexElement)
    currentIndexElement.appendChild(document.createTextNode(`${index + 1}/${paths.length}`))

    showTable(paths, playlist, currentIndex)
    const video = playVideo(paths[index])
    video.addEventListener('ended', next)

    // Hook keyboard shortcuts
    for (let [keyCode, fn] of Object.entries(SHORTCUTS)) {
      document.body.addEventListener('keydown', onKey(keyCode, () => fn(video)));
    }
    // Keep volume constant for Windows...
    video.onvolumechange = handleVolumeChange
    return true
  }

  function move (delta) {
    playlist((currentIndex + delta) % paths.length)
  }

  function next () {
    move(1)
  }

  function prev () {
    move(-1)
  }

  return { set: playlist, next, prev } 
}

function extractLinks (html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return Array.from(doc.body.children[2].children,
    a => a.getAttribute('href')).slice(1)
}

function prependPaths (arr, path) {
  return arr.map(a => `${path}/${a}`)
}

async function pathToList (path) {
  const data = await get(path)
  let list = []

  if (data['Content-Type'].includes('text/plain')) {
    lines = data.body.trim().split('\n')
    for (const line of lines) {
      let dir = line.split('/').slice(0,-1).join('/')
      if (dir.charAt(0) != '/') { dir = `/${dir}` }
      const filename = line.split('/').slice(-1)[0].trim()
      const regexp = new RegExp(filename)
      let links = extractLinks((await get(`${dir}`)).body)
      if (links.includes(filename) || links.map(unescape).includes(unescape(filename))) {
        list.push(`${dir}/${filename}`)
      } else {
        links = links.filter(link => link.match(regexp) || unescape(link).includes(filename) )
        list = list.concat(prependPaths(links, dir))
      }
    }
  } else if (data['Content-Type'].includes('text/html')) {
    list = list.concat(prependPaths(extractLinks(data.body), path))
  }

  const allowedExtensions = ['ogg', 'mp4', 'webm', 'mp3', 'wav']
  list = list.filter(path => allowedExtensions.includes(path.split('.').slice(-1)[0]))
  
  const shuffleBox = byId('shuffle')
  if (shuffleBox.checked) {
    shuffle(list)
  }
  return list
}

async function loadPlaylist (path) {
  path = path.trim()
  const plPath = byId('pl-path')
  plPath.value = path
  localStorage.setItem('recent', path)

  const list = await pathToList(path)
  const playlist = createPlaylist(list)
  playlist.set(0)

  // Right and left arrow keys (respectively)
  document.body.addEventListener('keydown', onKey(39, playlist.next))
  document.body.addEventListener('keydown', onKey(37, playlist.prev))
}

function startPlaylist () {
  const plPath = byId('pl-path')
  loadPlaylist(plPath.value.trim())
}

window.onload = function () {
  const plPath = byId('pl-path')
  plPath.addEventListener('keydown', onKey(13, startPlaylist))

  const shuffleBox = byId('shuffle')
  shuffleBox.checked = JSON.parse(localStorage.getItem('shuffle'))
  shuffleBox.addEventListener('change', event => {
    localStorage.setItem('shuffle', event.target.checked)
    startPlaylist()
  })


  const recent = localStorage.getItem('recent')
  const query = new URLSearchParams(window.location.search)
  const path = query.get('path') || recent
  if (path) {
    loadPlaylist(path)
  }
}

