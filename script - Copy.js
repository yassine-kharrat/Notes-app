const contentArea = document.getElementById("content-area");
const notesList = document.getElementById("notes-list");
const newNoteButton = document.getElementById("new-note");
const newGroupButton = document.getElementById("new-group");
const toggleSidebarButton = document.getElementById("toggle-sidebar");
const sidebar = document.querySelector(".notes-sidebar");

let notes = JSON.parse(localStorage.getItem("notes")) || { groups: {}, notes: {} };
let currentNoteId = null;
let draggedNoteId = null;
let dropTargetGroupId = null;
let isEditingGroupName = false;
let editingGroupId = null;

function renderNotesList() {
    notesList.innerHTML = "";

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
        toggleBtn.textContent = group.collapsed ? "" : "";
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
        notes.notes[currentNoteId].content = contentArea.innerHTML;
        saveNotes();
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

function saveNotes() {
    localStorage.setItem("notes", JSON.stringify(notes));
}

newNoteButton.addEventListener("click", createNewNote);
newGroupButton.addEventListener("click", createNewGroup);

toggleSidebarButton.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    const contentArea = document.getElementById("content-area");
    const notesList = document.getElementById("notes-list");

    if (sidebar.classList.contains("collapsed")) {
        contentArea.style.display = "none";
        notesList.style.display = "none";
    } else {
        contentArea.style.display = "block";
        notesList.style.display = "block";
        renderNotesList(); // Crucial: Re-render on sidebar open
        if (Object.keys(notes.notes).length === 0 && Object.keys(notes.groups).length === 0) {
            createNewNote();
        }
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

    if (editingGroupId) {
        const groupElement = document.querySelector(`[data-id="${editingGroupId}"]`);
        if (groupElement && groupElement.previousElementSibling) {
            const prevGroupElement = groupElement.previousElementSibling;
            const prevGroupId = prevGroupElement.dataset.id;

            // Move group in the groups object
            const groupsArray = Object.entries(notes.groups);
            const currentGroupIndex = groupsArray.findIndex(([id]) => id === editingGroupId);
            const prevGroupIndex = groupsArray.findIndex(([id]) => id === prevGroupId);
            if (currentGroupIndex > 0) {
                const temp = groupsArray[currentGroupIndex];
                groupsArray[currentGroupIndex] = groupsArray[prevGroupIndex];
                groupsArray[prevGroupIndex] = temp;
                notes.groups = Object.fromEntries(groupsArray);
                saveNotes();
                renderNotesList();
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

    if (editingGroupId) {
        const groupElement = document.querySelector(`[data-id="${editingGroupId}"]`);
        if (groupElement && groupElement.nextElementSibling) {
            const nextGroupElement = groupElement.nextElementSibling;
            const nextGroupId = nextGroupElement.dataset.id;

            // Move group in the groups object
            const groupsArray = Object.entries(notes.groups);
            const currentGroupIndex = groupsArray.findIndex(([id]) => id === editingGroupId);
            const nextGroupIndex = groupsArray.findIndex(([id]) => id === nextGroupId);
            if (currentGroupIndex < groupsArray.length - 1) {
                const temp = groupsArray[currentGroupIndex];
                groupsArray[currentGroupIndex] = groupsArray[nextGroupIndex];
                groupsArray[nextGroupIndex] = temp;
                notes.groups = Object.fromEntries(groupsArray);
                saveNotes();
                renderNotesList();
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


// Initial rendering
renderNotesList();
