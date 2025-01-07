const contentArea = document.getElementById("content-area");
const notesList = document.getElementById("notes-list");
const newNoteButton = document.getElementById("new-note");
const newGroupButton = document.getElementById("new-group");
const toggleSidebarButton = document.getElementById("toggle-sidebar");
const sidebar = document.querySelector(".notes-sidebar");

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Notes-app/sw.js', { scope: '/Notes-app/' })
    .then(function(registration) {
      console.log('Service Worker registered with scope:', registration.scope);
    })
    .catch(function(error) {
      console.log('Service Worker registration failed:', error);
    });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Save the event so it can be triggered later.
  deferredPrompt = e;
  // Show your custom install prompt (e.g., a button).
  const installButton = document.getElementById('installButton');
  installButton.style.display = 'block';

  installButton.addEventListener('click', () => {
    // Show the prompt
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the A2HS prompt');
      } else {
        console.log('User dismissed the A2HS prompt');
      }
      deferredPrompt = null;
    });
  });
});

let notes = { groups: {}, notes: {} };
let currentNoteId = null;
let draggedNoteId = null;
let dropTargetGroupId = null;
let isEditingGroupName = false;
let editingGroupId = null;

const dbName = "NotesApp";
const storeName = "notesStore";

// Open IndexedDB
let db;

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = function(event) {
            reject("Database error: " + event.target.errorCode);
        };
    });
}

// Save Notes to IndexedDB
function saveNotes() {
      if (!db) {
        console.error("Database is not initialized yet.");
        return;
    }
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const notesData = {
        id: "notes",  // You can use a static id since it's a single record
        data: notes   // Store your entire notes object here
    };
    const request = store.put(notesData); // Insert or update

    request.onsuccess = function() {
        console.log("Notes saved to IndexedDB");
    };

    request.onerror = function(event) {
        console.error("Error saving to IndexedDB", event.target.error);
    };
}

// Load Notes from IndexedDB
function loadNotes() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get("notes");

        request.onsuccess = function(event) {
            const result = event.target.result;
            if (result) {
                notes = result.data;  // Load the notes from the database
                resolve(notes);
            } else {
                resolve({ groups: {}, notes: {} }); // Default empty structure
            }
        };

        request.onerror = function(event) {
            reject("Error loading from IndexedDB", event.target.error);
        };
    });
}

async function initializeApp() {
    try {
        await openDb();
        notes = await loadNotes() || { groups: {}, notes: {} }; // Load from IndexedDB, or fallback to empty data
        renderNotesList();
    } catch (error) {
        console.error("Initialization error: ", error);
    }
}

initializeApp();

function renderNotesList() {
    console.log("Rendering notes list...");  // Log when the rendering starts
    notesList.innerHTML = "";  // Clear the list first

    for (const [groupId, group] of Object.entries(notes.groups)) {
        const groupLi = document.createElement("li");
        groupLi.classList.add("group");
        groupLi.dataset.id = groupId;
        groupLi.draggable = true;
        groupLi.textContent = group.title;

        groupLi.addEventListener("dblclick", () => {
            if (!isEditingGroupName) {
                startEditingGroupName(groupId);
            }
        });

        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = group.collapsed ? "+" : "-";
        toggleBtn.classList.add("group-toggle");
        toggleBtn.addEventListener("click", () => toggleGroup(groupId));
        groupLi.appendChild(toggleBtn);

        const deleteGroupBtn = document.createElement("button");
        deleteGroupBtn.textContent = "×";
        deleteGroupBtn.classList.add("delete-group-btn");
        deleteGroupBtn.addEventListener("click", (e) => deleteGroup(groupId, e));
        groupLi.appendChild(deleteGroupBtn);

        const notesUl = document.createElement("ul");
        notesUl.classList.add("notes-list");
        if (!group.collapsed) {
            for (const noteId of group.notes) {
                const noteLi = createNoteListItem(noteId);
                notesUl.appendChild(noteLi);
            }
        }
        groupLi.appendChild(notesUl);
        notesList.appendChild(groupLi);
    }

    // Render ungrouped notes
    for (const [noteId, note] of Object.entries(notes.notes)) {
        if (!Object.values(notes.groups).some(group => group.notes && group.notes.includes(noteId))) {
            const noteLi = createNoteListItem(noteId);
            notesList.appendChild(noteLi);
        }
    }

    addDragAndDropListeners();
}


function startEditingGroupName(groupId) {
    isEditingGroupName = true;
    editingGroupId = groupId;

    const groupLi = document.querySelector(`.group[data-id="${groupId}"]`);
    const originalTitle = notes.groups[groupId].title;

    // Create input element
    const input = document.createElement("input");
    input.type = "text";
    input.value = originalTitle;
    input.classList.add("group-name-input");

    // Replace text content with input
    groupLi.textContent = "";
    groupLi.appendChild(input);
    input.focus();

    input.addEventListener("blur", () => {
        finishEditingGroupName(groupId, input.value);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            finishEditingGroupName(groupId, input.value);
        }
        if(event.key === "Escape"){
            finishEditingGroupName(groupId, originalTitle)
        }
    });
}

function finishEditingGroupName(groupId, newTitle) {
    isEditingGroupName = false;
    editingGroupId = null;

    const groupLi = document.querySelector(`.group[data-id="${groupId}"]`);
    notes.groups[groupId].title = newTitle.trim() || "New Group"; // Prevent empty titles
    saveNotes();
    renderNotesList();
}

function createNoteListItem(noteId) {
    const li = document.createElement("li");
    li.textContent = getNoteTitle(notes.notes[noteId].content) || "Untitled Note";
    li.dataset.id = noteId;
    li.draggable = true;
    li.classList.add("note-list");

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "×";
    deleteBtn.classList.add("delete-btn");
    deleteBtn.addEventListener("click", (e) => deleteNote(noteId, e));
    li.appendChild(deleteBtn);
    li.addEventListener("click", () => loadNote(noteId));
    return li;
}

function getNoteTitle(content) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    for (let child of tempDiv.childNodes) {
        if (child.nodeType === Node.TEXT_NODE || child.textContent.trim() !== "") {
            return child.textContent.trim();
        }
    }
    return "Untitled Note";
}

function loadNote(id) {
    saveCurrentNote();
    currentNoteId = id;
    contentArea.innerHTML = notes.notes[id].content;
}

function saveCurrentNote() {
    if (currentNoteId) {
        // Ensure the note exists before setting content
        if (!notes.notes[currentNoteId]) {
            // If the note doesn't exist, initialize it
            notes.notes[currentNoteId] = {
                id: currentNoteId,
                content: contentArea.innerHTML
            };
        } else {
            // If the note exists, update its content
            notes.notes[currentNoteId].content = contentArea.innerHTML;
        }

        // Save the notes object (which contains all notes) to IndexedDB or localStorage
        saveNotes();

        // Optionally, re-render the notes list to reflect changes
        renderNotesList();
    }
}


function createNewNote() {
    const id = Date.now().toString();
    notes.notes[id] = { content: "New Note\n" };
    currentNoteId = id;
    contentArea.innerHTML = notes.notes[id].content;
    saveNotes();
    renderNotesList();
}


function createNewGroup() {
    const id = Date.now().toString();
    notes.groups[id] = { title: "New Group", notes: [], collapsed: false };
    saveNotes();
    renderNotesList();
}

function deleteNote(id, event) {
    event.stopPropagation();
    delete notes.notes[id];
    for (const group of Object.values(notes.groups)) {
        group.notes = group.notes.filter(noteId => noteId !== id);
    }
    saveNotes();
    renderNotesList();
    if (currentNoteId === id) {
        currentNoteId = null;
        contentArea.innerHTML = "Select or create a note to start writing...";
    }
}

function deleteGroup(id, event) {
    event.stopPropagation();
    delete notes.groups[id];
    saveNotes();
    renderNotesList();
}

function toggleGroup(id) {
    notes.groups[id].collapsed = !notes.groups[id].collapsed;
    saveNotes();
    renderNotesList();
}

notesList.addEventListener('click', (event) => {
    if (event.target.classList.contains('group')) {
        const groupId = event.target.dataset.id;
        toggleGroup(groupId);
    }
});

// function saveNotes() {
//     localStorage.setItem("notes", JSON.stringify(notes));
// }

newNoteButton.addEventListener("click", createNewNote);
newGroupButton.addEventListener("click", createNewGroup);

toggleSidebarButton.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");

    
    if (sidebar.classList.contains("collapsed")) {
        contentArea.style.width = "100%"; 
        notesList.style.display = "none"; 
    } else {
        contentArea.style.width = "calc(100% - 250px)"; 
        notesList.style.display = "block"; 
        renderNotesList(); 
    }
});

contentArea.addEventListener("input", saveCurrentNote);

function addDragAndDropListeners() {
    const listItems = document.querySelectorAll('#notes-list li, #notes-list, .notes-list, .group');
    listItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

let dragSrcEl = null;

function handleDragStart(e) {
    draggedNoteId = e.target.dataset.id;
    const isGroup = e.target.classList.contains('group');
    e.dataTransfer.setData('text/plain', draggedNoteId);
    e.dataTransfer.setData('isGroup', isGroup);
}

function handleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer.getData('isGroup') === 'true') {
        dropTargetGroupId = null;
        return;
    }
    if (e.target.classList.contains('group')) {
        dropTargetGroupId = e.target.dataset.id;
    } else if (e.target.parentNode && e.target.parentNode.classList.contains('group')) { // Check if parentNode exists
        dropTargetGroupId = e.target.parentNode.dataset.id;
    } else {
        dropTargetGroupId = null;
    }
}

function getDropIndex(e, selector) {
    const target = e.target.closest(selector);
    if (!target) return null;
    const targetRect = target.getBoundingClientRect();
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const siblings = Array.from(target.parentNode.children).filter(el => el.matches(selector));
    const targetIndex = siblings.indexOf(target);
    if (e.clientY > targetCenterY) {
        return targetIndex + 1;
    } else {
        return targetIndex;
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedNoteId) return;

    const draggedElement = document.querySelector(`[data-id="${draggedNoteId}"]`);

    if (e.dataTransfer.getData('isGroup') === 'true') {
        const newIndex = getDropIndex(e, '.group');
        if (newIndex !== null && newIndex !== Array.from(draggedElement.parentNode.children).indexOf(draggedElement)) {
            const groupsArray = Object.entries(notes.groups);
            const draggedGroupEntry = groupsArray.find(([id, group]) => id === draggedNoteId);

            if (draggedGroupEntry) {
                const [draggedGroupId, draggedGroup] = draggedGroupEntry;
                groupsArray.splice(groupsArray.indexOf(draggedGroupEntry), 1);
                groupsArray.splice(newIndex, 0, [draggedGroupId, draggedGroup]);
                notes.groups = Object.fromEntries(groupsArray);
                saveNotes();
                renderNotesList();
            }
        }
        return;
    }

    for (const group of Object.values(notes.groups)) {
        group.notes = group.notes.filter(id => id !== draggedNoteId);
    }

    if (dropTargetGroupId) {
        if (!notes.groups[dropTargetGroupId].notes.includes(draggedNoteId)) {
            notes.groups[dropTargetGroupId].notes.push(draggedNoteId);
        }
    }

    draggedNoteId = null;
    dropTargetGroupId = null;
    saveNotes();
    renderNotesList();
}

function handleDragEnd(e) {
    draggedNoteId = null;
    dropTargetGroupId = null
}

// ... other functions ...

function handleNoteDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.note-list, .notes-list, .group'); // Target list, note, or group
    if (!dropTarget) return; // Dropped outside valid area

    const draggedElement = document.querySelector(`[data-id="${draggedNoteId}"]`);
    if (!draggedElement) return;

    // Remove from previous location (group or top level)
    for (const group of Object.values(notes.groups)) {
        group.notes = group.notes.filter(noteId => noteId !== draggedNoteId);
    }

    if (dropTarget.classList.contains('group')) {
        // Dropped on a group
        const targetGroupId = dropTarget.dataset.id;
        notes.groups[targetGroupId].notes.push(draggedNoteId);
        dropTarget.querySelector('.notes-list').appendChild(draggedElement); // Move in DOM
    } else if (dropTarget.classList.contains('notes-list')) {
        // Dropped on a notes list (unassigned or in a group)
        if(dropTarget.closest('.group')) {
            const targetGroupId = dropTarget.closest('.group').dataset.id;
            notes.groups[targetGroupId].notes.push(draggedNoteId);
        }
        dropTarget.appendChild(draggedElement); // Move in DOM
    } else if (dropTarget.classList.contains('note-list')) {
        // Dropped on another note, insert before
        const targetNoteId = dropTarget.dataset.id;
        const targetNoteElement = document.querySelector(`[data-id="${targetNoteId}"]`);
        if (targetNoteElement && targetNoteElement.parentNode) {
            targetNoteElement.parentNode.insertBefore(draggedElement, targetNoteElement);
            // Update data structure for the group or unassigned list
            let targetGroup = Object.entries(notes.groups).find(([,group])=> group.notes.includes(targetNoteId));
            if(targetGroup){
                let groupNotes = notes.groups[targetGroup[0]].notes;
                groupNotes.splice(groupNotes.indexOf(targetNoteId), 0, groupNotes.splice(groupNotes.indexOf(draggedNoteId), 1)[0]);
            }
        }
    }

    saveNotes();
}

function handleGroupDrop(e) {
    e.preventDefault();
    const dropTargetGroup = e.target.closest('.group');
    if (!dropTargetGroup) return;

    const draggedGroupElement = document.querySelector(`[data-id="${draggedGroupId}"]`);
    if(!draggedGroupElement) return;

    const groupsArray = Object.entries(notes.groups);
    const draggedIndex = groupsArray.findIndex(([id]) => id === draggedGroupId);
    const dropIndex = groupsArray.findIndex(([id]) => id === dropTargetGroup.dataset.id);

    if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
        groupsArray.splice(dropIndex, 0, groupsArray.splice(draggedIndex, 1)[0]);
        notes.groups = Object.fromEntries(groupsArray);

        //DOM Manipulation
        const groupsList = document.getElementById("notes-list");
        groupsList.insertBefore(draggedGroupElement, dropTargetGroup);

        saveNotes();
    }
}

// ... other functions ...

function deleteGroup(id, event) {
    event.stopPropagation(); // Prevent triggering group selection
    delete notes.groups[id];
    saveNotes();
    renderNotesList();
}

if (Object.keys(notes.notes).length === 0 && Object.keys(notes.groups).length === 0) {
    createNewNote();
}
document.addEventListener('keydown', handleReorderKeyPress);

function handleReorderKeyPress(event) {
    if (event.ctrlKey && event.key === 'ArrowUp') {
        moveItemUp();
    } else if (event.ctrlKey && event.key === 'ArrowDown') {
        moveItemDown();
    }
}

function moveItemUp() {
    if (!currentNoteId && !draggedNoteId && !editingGroupId) {
        return; // No note or group is selected
    }

    if (currentNoteId) {
        const noteElement = document.querySelector(`[data-id="${currentNoteId}"]`);
        if (noteElement && noteElement.previousElementSibling) {
            const prevNoteElement = noteElement.previousElementSibling;
            const prevNoteId = prevNoteElement.dataset.id;

            // Check if note is part of a group
            let groupId = getNoteGroupId(currentNoteId);

            if (!groupId) {
                // Move note in the top-level notes (not in any group)
                const notesArray = Object.keys(notes.notes);
                const currentNoteIndex = notesArray.indexOf(currentNoteId);
                const prevNoteIndex = notesArray.indexOf(prevNoteId);

                if (currentNoteIndex > 0) {
                    const temp = notesArray[currentNoteIndex];
                    notesArray[currentNoteIndex] = notesArray[prevNoteIndex];
                    notesArray[prevNoteIndex] = temp;
                    notes.notes = Object.fromEntries(notesArray.map(id => [id, notes.notes[id]]));
                    saveNotes();
                    renderNotesList();
                }
            } else {
                // Move note within its group
                const groupNotes = notes.groups[groupId].notes;
                const currentNoteIndex = groupNotes.indexOf(currentNoteId);
                const prevNoteIndex = groupNotes.indexOf(prevNoteId);

                if (currentNoteIndex > 0) {
                    const temp = groupNotes[currentNoteIndex];
                    groupNotes[currentNoteIndex] = groupNotes[prevNoteIndex];
                    groupNotes[prevNoteIndex] = temp;
                    saveNotes();
                    renderNotesList();
                }
            }
        }
    }
}


function moveItemDown() {
    if (!currentNoteId && !draggedNoteId && !editingGroupId) {
        return; // No note or group is selected
    }

    if (currentNoteId) {
        const noteElement = document.querySelector(`[data-id="${currentNoteId}"]`);
        if (noteElement && noteElement.nextElementSibling) {
            const nextNoteElement = noteElement.nextElementSibling;
            const nextNoteId = nextNoteElement.dataset.id;

            // Check if note is part of a group
            let groupId = getNoteGroupId(currentNoteId);

            if (!groupId) {
                // Move note in the top-level notes (not in any group)
                const notesArray = Object.keys(notes.notes);
                const currentNoteIndex = notesArray.indexOf(currentNoteId);
                const nextNoteIndex = notesArray.indexOf(nextNoteId);

                if (currentNoteIndex < notesArray.length - 1) {
                    const temp = notesArray[currentNoteIndex];
                    notesArray[currentNoteIndex] = notesArray[nextNoteIndex];
                    notesArray[nextNoteIndex] = temp;
                    notes.notes = Object.fromEntries(notesArray.map(id => [id, notes.notes[id]]));
                    saveNotes();
                    renderNotesList();
                }
            } else {
                // Move note within its group
                const groupNotes = notes.groups[groupId].notes;
                const currentNoteIndex = groupNotes.indexOf(currentNoteId);
                const nextNoteIndex = groupNotes.indexOf(nextNoteId);

                if (currentNoteIndex < groupNotes.length - 1) {
                    const temp = groupNotes[currentNoteIndex];
                    groupNotes[currentNoteIndex] = groupNotes[nextNoteIndex];
                    groupNotes[nextNoteIndex] = temp;
                    saveNotes();
                    renderNotesList();
                }
            }
        }
    }
}


// Helper function to get the group ID of a note, or return null if it isn't in a group
function getNoteGroupId(noteId) {
    for (const groupId in notes.groups) {
        if (notes.groups[groupId].notes.includes(noteId)) {
            return groupId;
        }
    }
    return null; // The note is not in any group
}


if (Object.keys(notes).length === 0 || !currentNoteId) {
    createNewNote();
} else {
    renderNotesList();
}

// Initial rendering
renderNotesList();





// COLORS, BULLET POINTS, HORIZONTAL LINES
let currentColorIndex = 0;
const colors = ['red', 'green', 'black'];

document.getElementById('content-area').addEventListener('keydown', function(e) {
    const contentArea = e.target;

    if (e.ctrlKey) {
        if (e.key === ':') {
            e.preventDefault();
            insertHorizontalLine(contentArea);
        } else if (e.key === '!') {
            e.preventDefault();
            insertBulletPoint(contentArea);
        } else if (e.key === ',') {
            e.preventDefault();
            cycleSelectedTextColor(contentArea);
        }
        else if (e.key === '$') { // New: Ctrl + $ for bigger font
            e.preventDefault();
            increaseFontSize(contentArea);
        } else if (e.key === '*') { // New: Ctrl + * for smaller font
            e.preventDefault();
            decreaseFontSize(contentArea);
        } 
    }
});

function cycleSelectedTextColor(contentArea) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    if (selection.rangeCount > 0) {
        let currentColorIndex = 0; // Resetting index each time
        currentColorIndex = (currentColorIndex + 1) % colors.length;
        const color = colors[currentColorIndex];

        const span = document.createElement('span');
        span.style.color = color;

        range.surroundContents(span);
    }
}


function insertHorizontalLine(contentArea) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);  // Get the current selection

    if (selection.rangeCount > 0) {
        const hr = document.createElement('hr');  // Create a horizontal line
        range.deleteContents();  // Remove any selected text
        range.insertNode(hr);  // Insert the horizontal line at the cursor position

        // Move the cursor below the inserted horizontal line
        const newRange = document.createRange();
        newRange.setStartAfter(hr);  // Set the cursor after the <hr>
        newRange.setEndAfter(hr);
        selection.removeAllRanges();
        selection.addRange(newRange);  // Set the new cursor position
    }
}

function insertBulletPoint(contentArea) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);  // Get the current selection

    // Check if there is any selection (cursor isn't at the very end of content)
    if (selection.rangeCount > 0) {
        const ul = document.createElement('ul');
        const li = document.createElement('li');
        ul.appendChild(li);

        // Insert the bullet point at the current cursor position
        range.deleteContents(); // Remove any selected text (if any)
        range.insertNode(ul);   // Insert the bullet point

        // Move the cursor inside the newly created list item
        const newRange = document.createRange();
        newRange.setStart(li, 0); // Set the cursor at the start of the <li>
        newRange.setEnd(li, 0);
        selection.removeAllRanges();
        selection.addRange(newRange); // Set the new cursor position
    }
}
contentArea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault(); // Prevent default Tab behavior (focus shifting)
        if (e.shiftKey) {
            // Decrease indentation (Shift + Tab)
            document.execCommand('outdent');
        } else {
            // Increase indentation (Tab)
            document.execCommand('indent');
        }
    }
});

function applyFontSizeChange(contentArea, changeType) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    // Get the selected node (important: get the parent if it's a text node)
    let selectedNode = selection.anchorNode;
    if (selectedNode.nodeType === Node.TEXT_NODE) {
        selectedNode = selectedNode.parentNode;
    }

    // Find the closest ancestor span
    let span = selectedNode.closest('span');

    if (!span) {
        // Create a new span if none exists
        span = document.createElement('span');
        span.appendChild(range.extractContents());
        range.insertNode(span);
    }
    let currentSize = window.getComputedStyle(span).fontSize;

    if (!currentSize) {
        currentSize = "16px";
    }

    let fontSizeValue = parseFloat(currentSize);
    const minSize = 8;
    const maxSize = 72;

    if (changeType === 'increase') {
        fontSizeValue = Math.min(fontSizeValue + 2, maxSize);
    } else {
        fontSizeValue = Math.max(fontSizeValue - 2, minSize);
    }

    span.style.fontSize = `${fontSizeValue}px`;

    // Restore selection to the modified span
    range.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(range);
}

function increaseFontSize(contentArea) {
    applyFontSizeChange(contentArea, 'increase');
}

function decreaseFontSize(contentArea) {
    applyFontSizeChange(contentArea, 'decrease');
}




// Dark Mode
// Select the theme toggle button and the image inside it
const themeToggleButton = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// Check the current theme preference from localStorage
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeIcon.src = 'sun.png'; // Set to light mode icon (sun)
} else {
    document.body.classList.remove('dark-mode');
    themeIcon.src = 'moon.png'; // Set to dark mode icon (moon)
}

// Toggle theme on button click
themeToggleButton.addEventListener('click', function () {
    document.body.classList.toggle('dark-mode');
    
    // Toggle between the images based on the current theme
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        themeIcon.src = 'sun.png'; // Set to light mode icon
    } else {
        localStorage.setItem('theme', 'light');
        themeIcon.src = 'moon.png'; // Set to dark mode icon
    }
});










//PASTE IMAGE
contentArea.addEventListener("paste", handlePasteEvent);

function handlePasteEvent(event) {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            // It's an image, handle it
            const file = item.getAsFile();
            if (file) {
                handleImagePaste(file);
            }
            event.preventDefault();
            return;
        }
    }
}
function handleImagePaste(imageFile) {
    const reader = new FileReader();
    
    // Read the image as a base64 URL
    reader.onloadend = function() {
        const base64Image = reader.result;
        insertImageIntoContent(base64Image);
    };

    // Start reading the image file
    reader.readAsDataURL(imageFile);
}

function insertImageIntoContent(base64Image) {
    const img = document.createElement('img');
    img.src = base64Image;
    img.alt = 'Pasted Image';
    img.classList.add('note-image');  // Optional: Add a class for styling

    // Insert the image at the cursor position in contentArea
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    range.deleteContents(); // Remove any selected text
    range.insertNode(img);  // Insert the image at the cursor position

    // Remove the selection (deselect the image)
    selection.removeAllRanges();

    // Save the note content after inserting the image
    saveCurrentNote();
}



// CTRL + SPACE
document.getElementById('content-area').addEventListener('keydown', function(e) {
    const contentArea = e.target;

    // Ctrl + Space to reset text formatting
    if (e.ctrlKey && e.key === ' ') {
        e.preventDefault();
        resetTextStyle(contentArea);
    }
});

// Handle paste event to strip formatting
document.getElementById('content-area').addEventListener('paste', function(e) {
    e.preventDefault(); // Prevent the default paste behavior
    const clipboardData = e.clipboardData || window.clipboardData;
    const text = clipboardData.getData('text/plain'); // Get plain text from clipboard

    // Insert the text into the editable content area
    document.execCommand('insertText', false, text); 

    // Reset the style of the pasted text
    resetTextStyle(contentArea);
});

// Function to reset text style
function resetTextStyle(contentArea) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Clone the contents of the selected range to work with it without modifying the selection
        const fragment = range.cloneContents();

        // Create a temporary span element to apply the required styles
        const span = document.createElement('span');
        
        // Apply the required default styles
        span.style.fontFamily = 'Consolas, "Courier New", monospace';
        span.style.color = '#333';
        span.style.fontWeight = 'normal';  // No bold
        span.style.fontStyle = 'normal';   // No italic
        span.style.fontSize = '16px';      // Default font size
        span.style.lineHeight = '1.5';     // Optional: line height for better readability
        span.style.textDecoration = 'none';// No underline

        // Recursively strip out styles and any unnecessary elements from the selected content
        stripStyles(fragment);
        
        // Append the cleaned fragment into the span
        span.appendChild(fragment);

        // Replace the selected content with the new span
        range.deleteContents();
        range.insertNode(span);

        // Move the cursor to the end of the inserted content
        const newRange = document.createRange();
        newRange.setStartAfter(span);
        newRange.setEndAfter(span);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }
}

// Function to remove styles from pasted content (or selected content)
function stripStyles(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
        node.removeAttribute('style'); // Remove any inline styles
        node.removeAttribute('class'); // Remove any class attribute
        node.removeAttribute('id');    // Remove any id attribute

        // Recursively strip child nodes (to remove nested styles)
        for (let child of node.childNodes) {
            stripStyles(child);
        }
    } else if (node.nodeType === Node.TEXT_NODE) {
        // No action needed for text nodes
    }
}



// Export notes to a file
// Export only the selected group to a file
// Export only the selected group to a file with the group name as the filename
// Export either the selected group or all groups and notes if no group is selected
// Export either the selected group or all groups and notes if no group is selected
// Export Notes function
async function exportNotes() {
    try {
        const selectedGroupId = getNoteGroupId(currentNoteId);

        let exportData = {
            groups: {},
            notes: {}
        };

        if (selectedGroupId && notes.groups[selectedGroupId]) {
            const selectedGroup = notes.groups[selectedGroupId];

            // Export the selected group
            exportData.groups[selectedGroupId] = selectedGroup;

            // Include only the notes that are in the selected group
            selectedGroup.notes.forEach(noteId => {
                exportData.notes[noteId] = notes.notes[noteId];
            });

            const groupName = selectedGroup.title.trim() || "UntitledGroup";
            const sanitizedGroupName = groupName.replace(/[\/\\?%*:|"<>]/g, "_");

            const notesJson = JSON.stringify(exportData, null, 2);
            const blob = new Blob([notesJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sanitizedGroupName}.json`;
            a.click();
            URL.revokeObjectURL(url);

        } else {
            // Export all groups and notes
            exportData.groups = notes.groups;
            exportData.notes = notes.notes;

            const notesJson = JSON.stringify(exportData, null, 2);
            const blob = new Blob([notesJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'all_notes_and_groups.json';
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error("Error exporting notes: ", error);
    }
}

// Import Notes function
async function importNotes(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedNotes = JSON.parse(e.target.result);
            if (importedNotes && importedNotes.groups && importedNotes.notes) {

                // Merge the imported groups and notes with the existing notes
                const newNotes = { ...notes.notes }; // Clone the current notes

                // Merge groups and notes into IndexedDB
                for (const [groupId, group] of Object.entries(importedNotes.groups)) {
                    if (notes.groups[groupId]) {
                        notes.groups[groupId].notes.push(...group.notes);  // Merge the notes into existing group
                    } else {
                        notes.groups[groupId] = group;  // Add the new group
                    }
                }

                for (const [noteId, note] of Object.entries(importedNotes.notes)) {
                    if (!notes.notes[noteId]) {
                        notes.notes[noteId] = note;  // Add the new note if it doesn't exist
                    }
                }

                // Save merged data back to IndexedDB
                await saveNotesToDb(notes);

                // Re-render the notes list after the import
                renderNotesList();

                // Restore note content with HTML formatting
                for (const [noteId, note] of Object.entries(importedNotes.notes)) {
                    if (notes.notes[noteId]) {
                        notes.notes[noteId].content = note.content;  // Restore HTML content
                    }
                }

            } else {
                alert("Invalid notes file format.");
            }
        } catch (error) {
            alert("Error reading the file. Please ensure it's a valid JSON file.");
        }
    };
    reader.readAsText(file);
}

// Save notes to IndexedDB function
async function saveNotesToDb(notesData) {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const notesDataObj = {
        id: "notes",  // Use a static id as we are storing one record (the entire notes object)
        data: notesData
    };
    const request = store.put(notesDataObj);

    return new Promise((resolve, reject) => {
        request.onsuccess = function() {
            console.log("Notes successfully saved to IndexedDB");
            resolve();
        };
        request.onerror = function(event) {
            console.error("Error saving notes to IndexedDB: ", event.target.error);
            reject(event.target.error);
        };
    });
}
