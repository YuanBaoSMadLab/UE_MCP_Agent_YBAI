using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace YB_AIManager
{
    public partial class MainForm : Form
    {
        private List<ProjectInfo> projects = new List<ProjectInfo>();
        private string configFilePath;
        private string logFilePath;

        public MainForm()
        {
            InitializeComponent();
            configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "projects.json");
            logFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "manager-log.txt");
        }

        private void Log(string message)
        {
            try
            {
                string logMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
                File.AppendAllText(logFilePath, logMessage + Environment.NewLine);
            }
            catch { }
        }

        private void MainForm_Load(object? sender, EventArgs e)
        {
            LoadProjects();
            RefreshProjectList();
        }

        private void LoadProjects()
        {
            if (File.Exists(configFilePath))
            {
                try
                {
                    string json = File.ReadAllText(configFilePath);
                    projects = JsonSerializer.Deserialize<List<ProjectInfo>>(json) ?? new List<ProjectInfo>();
                }
                catch
                {
                    projects = new List<ProjectInfo>();
                }
            }
        }

        private void SaveProjects()
        {
            try
            {
                string json = JsonSerializer.Serialize(projects, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configFilePath, json);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"保存项目配置失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RefreshProjectList()
        {
            panelProjects.Controls.Clear();
            int y = 10;

            foreach (var project in projects)
            {
                Panel projectPanel = new Panel
                {
                    Width = panelProjects.ClientSize.Width - 20,
                    Height = 60,
                    Location = new Point(10, y),
                    BorderStyle = BorderStyle.FixedSingle,
                    BackColor = Color.White
                };

                Label lblName = new Label
                {
                    Text = project.Name,
                    Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold),
                    Location = new Point(10, 8),
                    AutoSize = true
                };

                Label lblPath = new Label
                {
                    Text = Path.GetFileName(project.UprojectPath),
                    Font = new Font("Microsoft YaHei UI", 8F),
                    ForeColor = Color.Gray,
                    Location = new Point(10, 32),
                    AutoSize = true
                };

                Button btnRun = new Button
                {
                    Text = "▶ 运行",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(80, 35),
                    Location = new Point(projectPanel.Width - 100, 12),
                    BackColor = Color.FromArgb(0, 122, 204),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnRun.Click += BtnRun_Click;

                Button btnEdit = new Button
                {
                    Text = "✏️",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(35, 35),
                    Location = new Point(projectPanel.Width - 140, 12),
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnEdit.Click += BtnEdit_Click;

                Button btnDelete = new Button
                {
                    Text = "🗑️",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(35, 35),
                    Location = new Point(projectPanel.Width - 180, 12),
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnDelete.Click += BtnDelete_Click;

                projectPanel.Controls.Add(lblName);
                projectPanel.Controls.Add(lblPath);
                projectPanel.Controls.Add(btnRun);
                projectPanel.Controls.Add(btnEdit);
                projectPanel.Controls.Add(btnDelete);

                panelProjects.Controls.Add(projectPanel);
                y += 70;
            }
        }

        private void btnAddProject_Click(object? sender, EventArgs e)
        {
            using (var form = new ProjectForm())
            {
                if (form.ShowDialog() == DialogResult.OK)
                {
                    projects.Add(form.Project);
                    SaveProjects();
                    RefreshProjectList();
                }
            }
        }

        private void BtnEdit_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                using (var form = new ProjectForm(project))
                {
                    if (form.ShowDialog() == DialogResult.OK)
                    {
                        int index = projects.IndexOf(project);
                        if (index >= 0)
                        {
                            projects[index] = form.Project;
                            SaveProjects();
                            RefreshProjectList();
                        }
                    }
                }
            }
        }

        private void BtnDelete_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                var result = MessageBox.Show($"确定要删除项目 \"{project.Name}\" 吗？", "确认删除", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (result == DialogResult.Yes)
                {
                    projects.Remove(project);
                    SaveProjects();
                    RefreshProjectList();
                }
            }
        }

        private void BtnRun_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                if (!File.Exists(project.UprojectPath))
                {
                    string msg = $"项目文件不存在: " + project.UprojectPath;
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string nodePath = Path.Combine(appDir, "nodejs", "node.exe");
                string cliPath = Path.Combine(appDir, "dist", "cli.js");
                string workingDir = Path.GetDirectoryName(project.UprojectPath) ?? appDir;

                Log($"AppDir: {appDir}");
                Log($"尝试查找 node.exe: {nodePath}");

                if (!File.Exists(nodePath))
                {
                    nodePath = Path.Combine(appDir, "..", "nodejs", "node.exe");
                    Log($"尝试查找 node.exe (备用): {nodePath}");
                }
                if (!File.Exists(cliPath))
                {
                    cliPath = Path.Combine(appDir, "..", "dist", "cli.js");
                    Log($"尝试查找 cli.js (备用): {cliPath}");
                }

                if (!File.Exists(nodePath))
                {
                    string msg = $"未找到 node.exe！\n请确保 nodejs 目录在正确位置。\n\n当前查找位置:\n{nodePath}";
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                if (!File.Exists(cliPath))
                {
                    string msg = $"未找到 dist/cli.js！\n请先运行 npm run build。\n\n当前查找位置:\n{cliPath}";
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Log($"找到 node.exe: {nodePath}");
                Log($"找到 cli.js: {cliPath}");
                Log($"工作目录: {workingDir}");

                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = nodePath,
                        Arguments = $"\"{cliPath}\"",
                        WorkingDirectory = workingDir,
                        UseShellExecute = true,
                        CreateNoWindow = false
                    };

                    Log("正在启动进程...");
                    Process.Start(psi);
                    Log("进程已启动！");
                }
                catch (Exception ex)
                {
                    string msg = $"启动失败: {ex.Message}\n{ex.StackTrace}";
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void txtCopyText_MouseClick(object? sender, MouseEventArgs e)
        {
            txtCopyText.SelectAll();
            Clipboard.SetText(txtCopyText.Text);
            MessageBox.Show("已复制到剪贴板！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
