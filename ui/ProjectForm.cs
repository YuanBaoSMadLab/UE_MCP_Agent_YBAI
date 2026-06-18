using System;
using System.IO;
using System.Windows.Forms;

namespace YB_AIManager
{
    public partial class ProjectForm : Form
    {
        public ProjectInfo Project { get; private set; }

        public ProjectForm(ProjectInfo? existingProject = null)
        {
            InitializeComponent();
            Project = existingProject ?? new ProjectInfo();
            if (existingProject != null)
            {
                Text = "编辑项目";
                txtName.Text = Project.Name;
                txtUprojectPath.Text = Project.UprojectPath;
            }
        }

        private void btnBrowse_Click(object? sender, EventArgs e)
        {
            if (openFileDialog.ShowDialog() == DialogResult.OK)
            {
                txtUprojectPath.Text = openFileDialog.FileName;
                if (string.IsNullOrWhiteSpace(txtName.Text))
                {
                    txtName.Text = Path.GetFileNameWithoutExtension(openFileDialog.FileName);
                }
            }
        }

        private void btnOK_Click(object? sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtName.Text))
            {
                MessageBox.Show("请输入项目名称！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrWhiteSpace(txtUprojectPath.Text) || !File.Exists(txtUprojectPath.Text))
            {
                MessageBox.Show("请选择有效的 .uproject 文件！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Project.Name = txtName.Text.Trim();
            Project.UprojectPath = txtUprojectPath.Text;
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
